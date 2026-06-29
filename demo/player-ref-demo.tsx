// Demonstrates (and verifies) the imperative PlayerRef — the @remotion/player drop-in API
// an editor's playback transport is built on. The buttons drive the Player through its ref;
// the readout updates from the player's own frameupdate/play/pause events.
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { AbsoluteFill, Player, type PlayerRef, useCurrentFrame } from '../src';

function Counter(): JSX.Element {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: '#10121a',
        color: '#fff',
        fontFamily: 'ui-monospace, monospace',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 120,
      }}
    >
      {frame}
    </AbsoluteFill>
  );
}

const btn: CSSProperties = {
  background: '#1a1a20',
  color: '#fff',
  border: '1px solid #2a2a30',
  borderRadius: 6,
  padding: '6px 12px',
  cursor: 'pointer',
};

export function PlayerRefDemo(): JSX.Element {
  const ref = useRef<PlayerRef>(null);
  const [liveFrame, setLiveFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }): void => setLiveFrame(e.detail.frame);
    const onPlay = (): void => setPlaying(true);
    const onPause = (): void => setPlaying(false);
    player.addEventListener('frameupdate', onFrame);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    return () => {
      player.removeEventListener('frameupdate', onFrame);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
    };
  }, []);

  return (
    <div style={{ marginTop: 36, borderTop: '1px solid #26262e', paddingTop: 24 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Imperative PlayerRef · the @remotion/player drop-in API</div>
      <div style={{ color: '#8a8a93', fontSize: 13, marginBottom: 14, maxWidth: 560 }}>
        The buttons drive the Player through its ref (seekTo / play / pause), and the readout updates from the player's own
        <code> frameupdate</code> event — the imperative surface an editor's playback transport is built on.
      </div>
      <Player
        ref={ref}
        composition={Counter}
        width={640}
        height={360}
        fps={30}
        durationInFrames={90}
        displayHeight={200}
        controls={false}
      />
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 13,
          color: '#e9e9ee',
        }}
      >
        <button type="button" data-testid="ref-seek" onClick={() => ref.current?.seekTo(45)} style={btn}>
          seekTo(45)
        </button>
        <button type="button" data-testid="ref-play" onClick={() => ref.current?.play()} style={btn}>
          play
        </button>
        <button type="button" data-testid="ref-pause" onClick={() => ref.current?.pause()} style={btn}>
          pause
        </button>
        <span style={{ marginLeft: 8, color: '#8a8a93' }}>
          frameupdate → frame{' '}
          <b data-testid="ref-frame" style={{ color: '#7fdca0' }}>
            {liveFrame}
          </b>{' '}
          · {playing ? 'playing' : 'paused'}
        </span>
      </div>
    </div>
  );
}
