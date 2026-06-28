// remover compatibility tool.
//
// Statically scans example compositions, extracts what they import from
// `remotion` / `@remotion/*`, and scores each against what remover actually
// exports — answering "would this Remotion composition drop in unchanged?"
//
//   npm run compat
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as remover from '../src/remotion';

// What remover provides for `import … from 'remotion'` (runtime exports).
const SUPPORTED = new Set(Object.keys(remover));

const ROOT = new URL('..', import.meta.url).pathname;
const EXAMPLES = join(ROOT, 'examples');

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.endsWith('.tsx') || e.endsWith('.ts')) out.push(p);
  }
  return out.sort();
}

const IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"](remotion|@remotion\/[^'"]+)['"]/g;

interface Use { sym: string; pkg: string; }
function parseUses(src: string): Use[] {
  const uses: Use[] = [];
  let m: RegExpExecArray | null;
  while ((m = IMPORT_RE.exec(src))) {
    const pkg = m[2]!;
    for (const raw of m[1]!.split(',')) {
      const sym = raw.trim().split(/\s+as\s+/)[0]!.trim();
      if (sym) uses.push({ sym, pkg });
    }
  }
  return uses;
}

type Status = 'supported' | 'missing' | 'ecosystem';
const classify = (u: Use): Status =>
  u.pkg !== 'remotion' ? 'ecosystem' : SUPPORTED.has(u.sym) ? 'supported' : 'missing';

function main(): void {
  const files = walk(EXAMPLES);
  const missingCore = new Map<string, number>();
  const ecoPkgs = new Map<string, Set<string>>();
  let ready = 0;

  console.log('\n  remover · compatibility report');
  console.log('  ' + '─'.repeat(58));

  for (const file of files) {
    const uses = parseUses(readFileSync(file, 'utf8'));
    const miss = uses.filter((u) => classify(u) === 'missing');
    const eco = uses.filter((u) => classify(u) === 'ecosystem');
    const ok = miss.length === 0 && eco.length === 0;
    if (ok) ready++;

    miss.forEach((u) => missingCore.set(u.sym, (missingCore.get(u.sym) ?? 0) + 1));
    eco.forEach((u) => {
      if (!ecoPkgs.has(u.pkg)) ecoPkgs.set(u.pkg, new Set());
      ecoPkgs.get(u.pkg)!.add(u.sym);
    });

    const name = relative(EXAMPLES, file).replace(/\/composition\.tsx$/, '');
    const tag = ok ? '✅ drop-in   ' : '❌ needs work';
    const detail = ok
      ? `${uses.length} remotion symbols, all supported`
      : [
          miss.length ? `missing remotion: {${miss.map((u) => u.sym).join(', ')}}` : '',
          eco.length ? `ecosystem: ${[...new Set(eco.map((u) => u.pkg))].join(', ')}` : '',
        ].filter(Boolean).join('  ·  ');
    console.log(`  ${tag}  ${name.padEnd(22)} ${detail}`);
  }

  console.log('  ' + '─'.repeat(58));
  console.log(`  drop-in ready: ${ready}/${files.length} examples`);
  if (missingCore.size) {
    console.log(`  missing core remotion symbols: ${[...missingCore.keys()].sort().join(', ')}`);
  }
  if (ecoPkgs.size) {
    console.log(`  ecosystem packages referenced (not implemented):`);
    for (const [pkg, syms] of ecoPkgs) console.log(`    ${pkg} → {${[...syms].join(', ')}}`);
  }
  console.log(`  remover implements ${SUPPORTED.size} \`remotion\` runtime exports.\n`);
}

main();
