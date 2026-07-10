// Flattens an mp4's moov sample table into typed arrays so time→byte-range is a binary
// search instead of a per-seek box walk. This is the whole trick behind rerender/extract:
// the moov already indexes every frame (offset, size, timestamps, keyflag) — parsers are
// slow only because they consume it lazily. Parsing 140k samples flat takes ~100ms once.

export interface SampleTable {
  /** e.g. 'avc1.4d4014' — WebCodecs codec string derived from avcC. */
  codec: string;
  /** avcC box payload — the VideoDecoder `description`. */
  description: Uint8Array;
  /** mdia timescale (ticks per second). */
  timescale: number;
  sampleCount: number;
  /** Per sample, in decode (= file) order. Presentation ticks, elst shift already applied. */
  presentationTicks: Float64Array;
  /** Per sample: absolute file byte offset. */
  byteOffsets: Float64Array;
  /** Per sample: byte size. */
  byteSizes: Uint32Array;
  /** Sample indices of sync samples (GOP starts), ascending. */
  keySampleIndices: Uint32Array;
}

interface BoxRange {
  type: string;
  /** payload start (after the 8- or 16-byte header) */
  start: number;
  end: number;
}

function readBoxes(view: DataView, start: number, end: number): BoxRange[] {
  const boxes: BoxRange[] = [];
  let at = start;
  while (at + 8 <= end) {
    const size32 = view.getUint32(at);
    const type = String.fromCharCode(view.getUint8(at + 4), view.getUint8(at + 5), view.getUint8(at + 6), view.getUint8(at + 7));
    const headerSize = size32 === 1 ? 16 : 8;
    const size = size32 === 1 ? Number(view.getBigUint64(at + 8)) : size32 === 0 ? end - at : size32;
    if (size < headerSize) throw new Error(`malformed box '${type}' at ${at}: size ${size}`);
    boxes.push({ type, start: at + headerSize, end: at + size });
    at += size;
  }
  return boxes;
}

function child(view: DataView, parent: BoxRange, ...path: string[]): BoxRange | null {
  let current = parent;
  for (const type of path) {
    const found = readBoxes(view, current.start, current.end).find((box) => box.type === type);
    if (!found) return null;
    current = found;
  }
  return current;
}

function expectBox(box: BoxRange | null, type: string): BoxRange {
  if (!box) throw new Error(`mp4 sample table: missing ${type}`);
  return box;
}

/** elst media_time of the first non-empty edit, in media timescale ticks. 0 when absent. */
function readEditShift(view: DataView, trak: BoxRange): number {
  const elst = child(view, trak, 'edts', 'elst');
  if (!elst) return 0;
  const version = view.getUint8(elst.start);
  const entryCount = view.getUint32(elst.start + 4);
  let at = elst.start + 8;
  for (let i = 0; i < entryCount; i++) {
    const mediaTime = version === 1 ? Number(view.getBigInt64(at + 8)) : view.getInt32(at + 4);
    at += version === 1 ? 20 : 12;
    if (mediaTime >= 0) return mediaTime; // -1 = empty edit (delay); skip
  }
  return 0;
}

/**
 * Parses the video trak of an mp4 `moov` (pass bytes spanning file offset 0 through the end
 * of the moov box — leading ftyp/free boxes are fine) into a flat {@link SampleTable}.
 * H.264 (avc1) only for now; other codecs are additive.
 */
export function parseSampleTable(moovBytes: Uint8Array): SampleTable {
  const view = new DataView(moovBytes.buffer, moovBytes.byteOffset, moovBytes.byteLength);
  const top = readBoxes(view, 0, moovBytes.byteLength);
  const moov = top.find((box) => box.type === 'moov');
  if (!moov) throw new Error('mp4 sample table: no moov in provided bytes');

  const video = readBoxes(view, moov.start, moov.end)
    .filter((box) => box.type === 'trak')
    .flatMap((trak) => {
      const stbl = child(view, trak, 'mdia', 'minf', 'stbl');
      const stsd = stbl && child(view, stbl, 'stsd');
      // stsd payload: version/flags (4) + entry_count (4), then sample entries
      const avc1 = stsd && readBoxes(view, stsd.start + 8, stsd.end).find((entry) => entry.type === 'avc1');
      return stbl && avc1 ? [{ trak, stbl, avc1 }] : [];
    })[0];
  if (!video) throw new Error('mp4 sample table: no avc1 video trak (only H.264 is supported)');
  const { trak, stbl, avc1 } = video;

  const mdhd = expectBox(child(view, trak, 'mdia', 'mdhd'), 'mdhd');
  const timescale = view.getUint8(mdhd.start) === 1 ? view.getUint32(mdhd.start + 20) : view.getUint32(mdhd.start + 12);

  // avcC: VisualSampleEntry is 78 bytes of fixed fields, then child boxes.
  const avcC = readBoxes(view, avc1.start + 78, avc1.end).find((box) => box.type === 'avcC');
  if (!avcC) throw new Error('mp4 sample table: avc1 entry has no avcC');
  const description = moovBytes.slice(avcC.start, avcC.end);
  const codec = `avc1.${[1, 2, 3].map((i) => description[i]!.toString(16).padStart(2, '0')).join('')}`;

  const boxes = readBoxes(view, stbl.start, stbl.end);
  const find = (type: string) => boxes.find((box) => box.type === type) ?? null;

  // stts → decode timestamps
  const stts = expectBox(find('stts'), 'stts');
  const sttsEntryCount = view.getUint32(stts.start + 4);
  let sampleCount = 0;
  for (let i = 0; i < sttsEntryCount; i++) sampleCount += view.getUint32(stts.start + 8 + i * 8);

  const decodeTicks = new Float64Array(sampleCount);
  {
    let sample = 0;
    let ticks = 0;
    for (let i = 0; i < sttsEntryCount; i++) {
      const count = view.getUint32(stts.start + 8 + i * 8);
      const delta = view.getUint32(stts.start + 12 + i * 8);
      for (let j = 0; j < count; j++) {
        decodeTicks[sample++] = ticks;
        ticks += delta;
      }
    }
  }

  // ctts → composition offsets (absent = all zero; v1 offsets are signed)
  const presentationTicks = new Float64Array(sampleCount);
  const editShift = readEditShift(view, trak);
  const ctts = find('ctts');
  {
    let sample = 0;
    if (ctts) {
      const version = view.getUint8(ctts.start);
      const entryCount = view.getUint32(ctts.start + 4);
      for (let i = 0; i < entryCount; i++) {
        const count = view.getUint32(ctts.start + 8 + i * 8);
        const offset = version === 1 ? view.getInt32(ctts.start + 12 + i * 8) : view.getUint32(ctts.start + 12 + i * 8);
        for (let j = 0; j < count; j++, sample++) presentationTicks[sample] = decodeTicks[sample]! + offset - editShift;
      }
    }
    for (; sample < sampleCount; sample++) presentationTicks[sample] = decodeTicks[sample]! - editShift;
  }

  // stss → sync samples (absent = every sample is sync)
  const stss = find('stss');
  let keySampleIndices: Uint32Array;
  if (stss) {
    const entryCount = view.getUint32(stss.start + 4);
    keySampleIndices = new Uint32Array(entryCount);
    for (let i = 0; i < entryCount; i++) keySampleIndices[i] = view.getUint32(stss.start + 8 + i * 4) - 1;
  } else {
    keySampleIndices = new Uint32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) keySampleIndices[i] = i;
  }

  // stsz → sizes
  const stsz = expectBox(find('stsz'), 'stsz');
  const uniformSize = view.getUint32(stsz.start + 4);
  const byteSizes = new Uint32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) byteSizes[i] = uniformSize !== 0 ? uniformSize : view.getUint32(stsz.start + 12 + i * 4);

  // stsc + stco/co64 → per-sample absolute offsets
  const stsc = expectBox(find('stsc'), 'stsc');
  const stscEntryCount = view.getUint32(stsc.start + 4);
  const co64 = find('co64');
  const stco = co64 ?? expectBox(find('stco'), 'stco');
  const chunkCount = view.getUint32(stco.start + 4);
  const byteOffsets = new Float64Array(sampleCount);
  {
    let sample = 0;
    let stscEntry = 0;
    for (let chunk = 0; chunk < chunkCount && sample < sampleCount; chunk++) {
      // advance to the stsc entry governing this chunk (entries carry 1-based first_chunk)
      while (stscEntry + 1 < stscEntryCount && view.getUint32(stsc.start + 8 + (stscEntry + 1) * 12) <= chunk + 1) stscEntry++;
      const samplesPerChunk = view.getUint32(stsc.start + 12 + stscEntry * 12);
      let offset = co64 ? Number(view.getBigUint64(stco.start + 8 + chunk * 8)) : view.getUint32(stco.start + 8 + chunk * 4);
      for (let i = 0; i < samplesPerChunk && sample < sampleCount; i++, sample++) {
        byteOffsets[sample] = offset;
        offset += byteSizes[sample]!;
      }
    }
    if (sample !== sampleCount) throw new Error(`mp4 sample table: chunk map covered ${sample} of ${sampleCount} samples`);
  }

  return { codec, description, timescale, sampleCount, presentationTicks, byteOffsets, byteSizes, keySampleIndices };
}
