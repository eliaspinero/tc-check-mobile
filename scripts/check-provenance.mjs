// Every code file in client/src/checking/ and every stylesheet in client/src/ds/ (and their subfolders) is copied
// from translationCore 4 and must say so in its first line:
//   // Copied from unfoldingWord/translationCore4 <path> at <commit>. Changes: <...>.
//   /* Copied from unfoldingWord/translationCore4 <path> at <commit>. Changes: <...>. */
// With TC4_DIR set to a tC4 checkout, the named path must also exist at the named commit.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const src = path.resolve(import.meta.dirname, '../client/src');
const COPIED = [
  { dir: 'checking', files: /\.(ts|tsx|js|mjs)$/, header: /^\/\/ Copied from unfoldingWord\/translationCore4 (\S+) at ([0-9a-f]{40})\. Changes: .+\.$/ },
  { dir: 'ds', files: /\.css$/, header: /^\/\* Copied from unfoldingWord\/translationCore4 (\S+) at ([0-9a-f]{40})\. Changes: .+\. \*\/$/ },
];
const tc4 = process.env.TC4_DIR;
const failures = [];

for (const { dir, files, header } of COPIED) {
  const root = path.join(src, dir);
  for (const name of fs.readdirSync(root, { recursive: true }).filter((f) => files.test(f)).sort()) {
    const shown = path.join(dir, name);
    const first = fs.readFileSync(path.join(root, name), 'utf8').split(/\r?\n/, 1)[0];
    const m = header.exec(first);
    if (!m) {
      failures.push(`${shown}: first line is not the provenance header`);
      continue;
    }
    if (tc4) {
      try {
        execFileSync('git', ['-C', tc4, 'cat-file', '-e', `${m[2]}:${m[1]}`], { stdio: 'ignore' });
      } catch {
        failures.push(`${shown}: ${m[1]} does not exist at ${m[2]} in ${tc4}`);
      }
    }
  }
}

if (!tc4) console.log('check-provenance: TC4_DIR not set, so the tC4 paths were not checked');
if (failures.length) {
  console.error(`check-provenance: ${failures.length} file(s) fail\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('check-provenance: ok');
