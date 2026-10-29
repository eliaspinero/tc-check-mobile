// Seed an empty rig (dev-env/README.md): the sample project, and every resource it pins, so the journeys
// find what they expect. The only step that uses the network: each pin is downloaded once from Door43 into
// dev-env/state/cache, and installed only when its metadata declares the pinned commit.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const here = path.dirname(fileURLToPath(import.meta.url));
const RIG = 'http://127.0.0.1:19980/api';
const REPOS = path.resolve(here, '../state/pankosmia_repos');
const CACHE = path.resolve(here, '../state/cache');
const SAMPLE = '_local_/_local_/sample_burrito';

const listLocal = async () => (await (await fetch(`${RIG}/git/list-local-repos`)).json());

// The sample project, as a git repo the journeys copy (git/copy) and commit to.
const placeSample = () => {
  const dir = path.join(REPOS, ...SAMPLE.split('/'));
  if (existsSync(dir)) return console.log(`kept ${SAMPLE}`);
  cpSync(path.join(here, 'sample-burrito'), dir, { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.name=tc-check seed', '-c', 'user.email=seed@tc-check.invalid', 'commit', '-q', '-m', 'sample project');
  console.log(`placed ${SAMPLE}`);
};

// The pins installPins.ts neededPins reads: both language sets' tN, TWL, tW, and the source panes.
const neededPins = (resources) => {
  const out = [];
  for (const rung of ['primary', 'fallback'])
    for (const slot of ['translationNotes', 'translationWordsLinks', 'translationWords']) {
      const pin = resources.languageSets?.[rung]?.[slot];
      if (pin) out.push(pin);
    }
  out.push(...(resources.extraScripture ?? []));
  return [...new Map(out.map((p) => [`${p.repoPath.toLowerCase()}@${p.sha}`, p])).values()];
};

const download = async (pin) => {
  const file = path.join(CACHE, `${pin.repoPath.split('/').pop()}_${pin.version}.sb.zip`);
  if (!existsSync(file)) {
    const url = `https://${pin.repoPath}/sb/${pin.version}.zip`;
    console.log(`downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
  }
  return new Uint8Array(readFileSync(file));
};

// As installPins.ts does: strip the export's top folder and check the declared commit.
const unwrapChecked = (bytes, pin) => {
  const entries = unzipSync(bytes);
  const names = Object.keys(entries).filter((n) => !n.endsWith('/'));
  const tops = new Set(names.map((n) => n.split('/')[0]));
  const prefix = tops.size === 1 && !names.includes('metadata.json') ? `${[...tops][0]}/` : '';
  const files = {};
  for (const n of names) if (n.length > prefix.length) files[n.slice(prefix.length)] = entries[n];
  const meta = JSON.parse(new TextDecoder().decode(files['metadata.json']));
  const revision = Object.values(meta.identification?.primary?.dcs ?? {})[0]?.revision;
  if (revision !== pin.sha) throw new Error(`${pin.repoPath} ${pin.version} is commit ${revision}, the sample pins ${pin.sha}: not installed`);
  return files;
};

// Each pin installs as `_local_/_sideloaded_/<repo>`, the path installedPathOf also accepts, so the
// journeys' own installs (owner-qualified, e2e/teardown.ts) never collide with the seed's. The files are
// written to disk, as pankosmia-web's burrito/zipped unpacks them: that route takes at most 1 MiB, the
// rig runs pankosmia-web as the phone does, and most pins are larger.
const installPins = async () => {
  const resources = JSON.parse(readFileSync(path.join(here, 'sample-burrito/ingredients/checking/resources.json'), 'utf8'));
  for (const pin of neededPins(resources)) {
    const target = `_local_/_sideloaded_/${pin.repoPath.split('/').pop()}`;
    if ((await listLocal()).includes(target)) {
      console.log(`kept ${target}`);
      continue;
    }
    const files = unwrapChecked(await download(pin), pin);
    const dir = path.join(REPOS, ...target.split('/'));
    for (const [name, bytes] of Object.entries(files)) {
      const file = path.join(dir, ...name.split('/'));
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    }
    console.log(`installed ${target} (${pin.version})`);
  }
};

try {
  await fetch(`${RIG}/version`);
} catch {
  console.error('The rig does not answer on 127.0.0.1:19980. Start it first: npm run rig');
  process.exit(1);
}
placeSample();
await installPins();
console.log('seeded');
