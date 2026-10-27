// Build the client and register it in the shell's embedded Pankosmia resources as the
// `tc-check` client. pankosmia-web 0.18.15 (bootstrap.rs build_client_record) looks for a client
// under <app_resources>/clients/<path>, serves its build/ folder at package.json "homepage", and
// reads pankosmia_metadata.json and storage_id.json beside it.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, 'shell/src-tauri/pankosmia_resources/lib/clients/tc-check');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

// `--qa` builds the test client, bound to qa.door43.org (vite mode "qa"); without it the client is bound
// to production. A test APK is built with `--qa`; a store build never is.
const qa = process.argv.includes('--qa');
const expected = qa ? 'https://qa.door43.org' : 'https://git.door43.org';
const forbidden = qa ? 'https://git.door43.org' : 'https://qa.door43.org';
execSync(qa ? 'npm run build -- --mode qa' : 'npm run build', { cwd: root, stdio: 'inherit' });

// The build chooses the server (AGENTS.md); this proves the bundle carries the one it chose.
const bundle = fs
  .readdirSync(path.join(root, 'dist/assets'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => fs.readFileSync(path.join(root, 'dist/assets', f), 'utf8'))
  .join(' ');
if (!bundle.includes(expected) || bundle.includes(forbidden)) {
  console.error(`build-client-into-shell: a ${qa ? 'qa' : 'production'} build must name ${expected} and not ${forbidden}`);
  process.exit(1);
}
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(path.join(root, 'dist'), path.join(target, 'build'), { recursive: true });

const write = (name, value) => fs.writeFileSync(path.join(target, name), `${JSON.stringify(value, null, 2)}\n`);
write('package.json', { name: 'tc-check', version, private: true, homepage: '/clients/tc-check' });
write('pankosmia_metadata.json', {
  id: 'tc-check',
  require: { net: false },
  minServerVersion: '0.18.15',
  i18n: { title: { en: 'tC Check', es: 'tC Check' } },
});
// A fixed id: the platform keys this client's settings by it, so it must not change between builds.
write('storage_id.json', { id: '6f1d2a8e-4b7c-4c1e-9a52-3d0e7b9c2f41' });

if (!fs.existsSync(path.join(target, 'build', 'index.html'))) {
  console.error('build-client-into-shell: build/index.html is missing');
  process.exit(1);
}
console.log(`build-client-into-shell: client ${version} (${expected}) registered at ${path.relative(root, target)}`);
