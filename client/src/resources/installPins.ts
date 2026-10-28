// Install the resources a project pins (BURRITO-SPEC §5.3). The download, unwrap, revision
// check and re-zip follow tC4 src/data/resourceFetch.ts and src/data/installed.ts at
// b1911407b00577bf04c4bed1499bd5ac45423b0b (sbZipUrl, archiveZipUrl, zipArchiveComment,
// unwrapExport, rezip, localRepoPathFromRepoPath); the lexicon re-pack and the install records
// in client settings are left out, because slice 1 reads no lexicon and identifies an install
// by the revision its own metadata declares.
import { unzipSync, zipSync } from 'fflate';
import type { ResourcePin, ResourcesFile } from '../checking/types';
import type { ProjectSource } from '../project/ProjectSource';

/** The pins slice 1 reads: both language sets' tN, TWL and tW, and the source panes (ULT, UST). */
export const neededPins = (resources: ResourcesFile): ResourcePin[] => {
  const out: ResourcePin[] = [];
  for (const rung of ['primary', 'fallback'] as const) {
    const set = resources.languageSets?.[rung];
    for (const slot of ['translationNotes', 'translationWordsLinks', 'translationWords'] as const) if (set?.[slot]) out.push(set[slot]);
  }
  for (const pin of resources.extraScripture ?? []) out.push(pin);
  const seen = new Set<string>();
  return out.filter((p) => {
    const key = `${p.repoPath.toLowerCase()}@${p.sha}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const ownerRepo = (repoPath: string): { owner: string; repo: string } => {
  const parts = repoPath.replace(/^https?:\/\//, '').split('/').filter(Boolean);
  return { owner: (parts[parts.length - 2] ?? '').toLowerCase(), repo: (parts[parts.length - 1] ?? '').toLowerCase() };
};

const canonicalPathOf = (pin: ResourcePin): string => {
  const { owner, repo } = ownerRepo(pin.repoPath);
  return `_local_/_sideloaded_/${owner ? `${owner}--${repo}` : repo}`;
};
/** The commit-qualified path, as tC4 state.jsx installs a second commit of a repo: `<canonical>--<sha12>`. */
const shaPathOf = (pin: ResourcePin): string => `${canonicalPathOf(pin)}--${pin.sha.slice(0, 12)}`;

/** Where a pin installs. A pin with a release tag takes tC4's canonical owner-qualified path while it is
 * free; when another commit of the repo holds it, or the pin names only a commit (its archive declares no
 * revision to identify it by later), the commit-qualified path, whose name carries the sha. */
export const installPathOf = (pin: ResourcePin, local: string[]): string => {
  const canonical = canonicalPathOf(pin);
  return pin.version && !local.some((p) => p.toLowerCase() === canonical) ? canonical : shaPathOf(pin);
};

/** The commit a burrito's metadata declares for its DCS identity, or null. */
export const declaredRevision = (meta: unknown): string | null => {
  const dcs = (meta as { identification?: { primary?: { dcs?: Record<string, { revision?: string }> } } })?.identification?.primary?.dcs ?? {};
  return Object.values(dcs)[0]?.revision ?? null;
};

/** The local path that holds this exact pin, or null. The commit-qualified path names the sha, so it is
 * this pin by its name. Otherwise the repo's canonical path (`<owner>--<repo>`, or `<repo>` as tC4's rig
 * seed installs) holds it when its declared revision is the pinned sha. */
export const installedPathOf = async (pin: ResourcePin, local: string[], source: ProjectSource): Promise<string | null> => {
  const lower = local.map((p) => p.toLowerCase());
  const byName = local[lower.indexOf(shaPathOf(pin))];
  if (byName) return byName;
  const { repo } = ownerRepo(pin.repoPath);
  const candidates = [canonicalPathOf(pin), `_local_/_sideloaded_/${repo}`];
  for (const path of local.filter((p) => candidates.includes(p.toLowerCase()))) {
    try {
      if (declaredRevision(await source.readMetadata(path)) === pin.sha) return path;
    } catch {
      // unreadable metadata: not this pin
    }
  }
  return null;
};

export const missingPins = async (resources: ResourcesFile, source: ProjectSource): Promise<ResourcePin[]> => {
  const local = await source.listLocal();
  const out: ResourcePin[] = [];
  for (const pin of neededPins(resources)) if (!(await installedPathOf(pin, local, source))) out.push(pin);
  return out;
};

const hostPath = (repoPath: string) => repoPath.replace(/^https?:\/\//, '');
export const sbZipUrl = (pin: ResourcePin & { version: string }) => `https://${hostPath(pin.repoPath)}/sb/${pin.version}.zip`;
export const archiveZipUrl = (pin: ResourcePin) => `https://${hostPath(pin.repoPath)}/archive/${pin.sha}.zip`;

/** The zip archive comment, where Gitea records the packed commit of an /archive/<sha>.zip. */
const zipArchiveComment = (bytes: Uint8Array): string | null => {
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes[i] !== 0x50 || bytes[i + 1] !== 0x4b || bytes[i + 2] !== 0x05 || bytes[i + 3] !== 0x06) continue;
    const length = bytes[i + 20] | (bytes[i + 21] << 8);
    if (length === 0) return null;
    return new TextDecoder().decode(bytes.subarray(i + 22, i + 22 + length)).trim() || null;
  }
  return null;
};

const escapesRoot = (name: string): boolean => {
  const n = name.replace(/\\/g, '/');
  return n.startsWith('/') || /^[A-Za-z]:/.test(n) || n.split('/').some((s) => /^\.\.[. ]*$/.test(s));
};

/** Strip the export's single top folder; refuse an archive that is not a burrito or escapes its root. */
const unwrap = (bytes: Uint8Array): { files: Record<string, Uint8Array>; metadata: unknown } => {
  const entries = unzipSync(bytes);
  for (const name of Object.keys(entries))
    if (escapesRoot(name)) throw new Error(`the downloaded archive contains an entry that escapes its folder (${name}) — not installed`);
  const names = Object.keys(entries).filter((n) => !n.endsWith('/'));
  const tops = new Set(names.map((n) => n.split('/')[0]));
  const prefix = tops.size === 1 && !names.includes('metadata.json') ? `${[...tops][0]}/` : '';
  const files: Record<string, Uint8Array> = {};
  for (const name of names) {
    const rel = name.slice(prefix.length);
    if (rel === '' || rel.startsWith('.git/') || rel.endsWith('.DS_Store')) continue;
    files[rel] = entries[name];
  }
  if (!files['metadata.json']) throw new Error('the downloaded archive has no metadata.json — not a burrito');
  if (!Object.keys(files).some((n) => n.startsWith('ingredients/'))) throw new Error('the downloaded archive has no ingredients — not a burrito');
  return { files, metadata: JSON.parse(new TextDecoder().decode(files['metadata.json'])) };
};

/** The importer needs explicit directory entries (pankosmia-web post_zipped_repo.rs, per tC4). */
const rezip = (files: Record<string, Uint8Array>): Uint8Array => {
  const out: Record<string, Uint8Array> = {};
  const dirs = new Set<string>();
  for (const name of Object.keys(files)) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(`${parts.slice(0, i).join('/')}/`);
  }
  for (const d of [...dirs].sort()) out[d] = new Uint8Array(0);
  Object.assign(out, files);
  return zipSync(out, { level: 0 });
};

/** A network failure (offline or cut off): the person can retry; nothing was installed. */
export class DownloadStopped extends Error {
  constructor(readonly url: string) {
    super(`Download stopped (${url})`);
    this.name = 'DownloadStopped';
  }
}

/** A download Door43 answered, but that cannot be installed: the version is not there, or the archive is not
 * the pinned commit. The message is the raw detail; the reason is what the screen tells the checker. */
export class DownloadFailed extends Error {
  constructor(readonly reason: 'notFound' | 'mismatch', message: string) {
    super(message);
    this.name = 'DownloadFailed';
  }
}

/** The release tag that names a commit, read page by page from the DCS tags API (tC4 tagForCommitSha),
 * or null when no tag names it or DCS cannot be asked. */
const tagForSha = async (pin: ResourcePin, fetchFn: typeof fetch): Promise<string | null> => {
  const path = hostPath(pin.repoPath);
  const slash = path.indexOf('/');
  const api = `https://${path.slice(0, slash)}/api/v1/repos/${path.slice(slash + 1)}/tags`;
  for (let page = 1; page <= 20; page++) {
    let rows: Array<{ name?: string; commit?: { sha?: string } }>;
    try {
      const res = await fetchFn(`${api}?limit=50&page=${page}`);
      if (!res.ok) return null;
      rows = await res.json();
    } catch {
      return null;
    }
    const hit = rows.find((t) => t.commit?.sha === pin.sha);
    if (hit?.name) return hit.name;
    if (rows.length === 0) return null;
  }
  return null;
};

/** The install of each pin now running, keyed `repoPath@sha`. A download outlives the screen that started
 * it, so a checker who goes Back and opens the project again joins the running install, not a second one. */
const inFlight = new Map<string, Promise<string>>();

/** Install one pin, once: an install of the same pin already running is joined; a pin already installed
 * returns its path without a download. */
export const installPin = (pin: ResourcePin, source: ProjectSource, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<string> => {
  const key = `${pin.repoPath.toLowerCase()}@${pin.sha}`;
  const running = inFlight.get(key);
  if (running) return running;
  const job = downloadAndInstall(pin, source, fetchFn).finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
};

/** Download one pin, verify its commit against the pinned sha, install it. Installs nothing on any failure.
 * A pin with a tag fetches the tag's sb-zip export; a sha-only pin first looks for the tag that names its
 * commit, because a resource-container repo is a burrito only in that export; only an untagged commit
 * falls back to the Gitea archive, verified by the commit Gitea writes in its zip comment. */
const downloadAndInstall = async (pin: ResourcePin, source: ProjectSource, fetchFn: typeof fetch): Promise<string> => {
  const already = await installedPathOf(pin, await source.listLocal(), source);
  if (already) return already;
  const tag = pin.version ?? (await tagForSha(pin, fetchFn));
  const url = tag ? sbZipUrl({ ...pin, version: tag }) : archiveZipUrl(pin);
  let bytes: Uint8Array;
  try {
    const res = await fetchFn(url);
    if (res.status === 404) throw new DownloadFailed('notFound', `could not download ${url} (HTTP 404)`);
    if (!res.ok) throw new Error(`could not download ${url} (HTTP ${res.status})`);
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    if (e instanceof TypeError || (e as Error).name === 'AbortError') throw new DownloadStopped(url);
    throw e;
  }
  const { files, metadata } = unwrap(bytes);
  const revision = tag ? declaredRevision(metadata) : zipArchiveComment(bytes);
  if (revision !== pin.sha)
    throw new DownloadFailed('mismatch', `${pin.repoPath} ${pin.version ?? ''} is commit ${revision?.slice(0, 12) ?? 'unknown'}…, but the project pins ${pin.sha.slice(0, 12)}… — not installed`);
  const local = await source.listLocal();
  const installedMeanwhile = await installedPathOf(pin, local, source);
  if (installedMeanwhile) return installedMeanwhile;
  const target = installPathOf(pin, local);
  await source.installResourceZip(target, rezip(files));
  return target;
};
