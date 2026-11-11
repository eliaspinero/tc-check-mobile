// What this run of the app has already read, by key (#44): a screen that comes back shows it at once, with no
// skeleton, and reads again only what is not kept. Two screens that want the same thing at the same time share
// one read. It lives above the screens, because App's go() unmounts them.
//
// As tC4's caches (STORAGE.md §3.6), this never decides what exists: a missing entry only means reading again.
// What changes a project replaces its entries: a decision (the new session), a Sync, a resource installed.
//
// A few of these results are also kept on the device, so they show at once after the app restarts (slice 44b):
// Door43's last project list for each checker, the signed-in username, and the books' progress. A failure is
// never kept there.
import type { CheckingEngine, Tool } from '../engine/CheckingEngine';
import type { Door43Repo } from '../door43/door43Api';
import { keptName, keptStore } from '../device/keptStore';
import type { ProjectSource } from '../project/ProjectSource';
import { loadSession, type Session } from './loadSession';
import { loadCheckContext, type CheckContext } from './loadCheckContext';

type Rung = 'primary' | 'fallback' | null;
type Entry = { promise: Promise<unknown>; value?: { got: unknown }; failed?: true };
const entries = new Map<string, Entry>();

/** The kept result for `key`, or the read's. A failure is kept as well, as the answer until a change replaces it
 * (a list that cannot be shown says why each time without asking again). */
export const keep = <T>(key: string, read: () => Promise<T>): Promise<T> => {
  const found = entries.get(key);
  if (found) return found.promise as Promise<T>;
  const entry: Entry = { promise: Promise.resolve() };
  entry.promise = read().then(
    (got) => {
      entry.value = { got };
      noteProgress(key, got);
      return got;
    },
    (e: unknown) => {
      entry.failed = true;
      throw e;
    },
  );
  entries.set(key, entry);
  return entry.promise as Promise<T>;
};

/** The result kept for `key` once its read has landed, for a screen's first render. */
export const kept = <T>(key: string): T | undefined => entries.get(key)?.value?.got as T | undefined;

/** True once the read kept for `key` has failed. */
export const keptFailed = (key: string): boolean => entries.get(key)?.failed === true;

/** Keeps `value` for `key`, replacing what was there: a result read fresh after a change. */
export const keepNow = <T>(key: string, value: T): void => {
  entries.set(key, { promise: Promise.resolve(value), value: { got: value } });
  noteProgress(key, value);
};

/** Keeps a read that has started for `key` in place of what was there, before it lands: a screen that asks
 * meanwhile (a list opened by Back right after a decision) gets the new answer, not the old one. */
export const keepRead = <T>(key: string, read: Promise<T>): void => {
  entries.delete(key);
  void keep(key, () => read).catch(() => undefined);
};

/** Drops every entry of a project, so its screens read it again: after a Sync. */
export const forgetProject = (repoPath: string): void => {
  for (const key of [...entries.keys()]) if (key.split('|')[1] === repoPath) entries.delete(key);
};

/** Drops what every project derived from the resources on this device, after one was installed: any project may
 * pin it. Door43's list and the resources' own files stay. */
export const forgetAfterInstall = (): void => {
  for (const key of [...entries.keys()]) if (!key.startsWith('projects|') && !key.startsWith('text|')) entries.delete(key);
};

/** The keys, one place for each kind; the project's path is always the second part. */
export const keys = {
  session: (repoPath: string, tool: string, book: string) => `session|${repoPath}|${tool}|${book}`,
  scope: (repoPath: string) => `scope|${repoPath}`,
  context: (repoPath: string, book: string, rung: Rung) => `context|${repoPath}|${book}|${rung}`,
  ready: (repoPath: string) => `ready|${repoPath}`,
  projects: (host: string, username: string) => `projects||${host}|${username}`,
  /** The repositories on this device (Pankosmia's local list). */
  local: () => 'local||',
};

/** A project's session for one book and tool, read once per run until a change replaces it. */
export const sessionOf = (repoPath: string, tool: Tool, book: string, source: ProjectSource, engine: CheckingEngine): Promise<Session> =>
  keep(keys.session(repoPath, tool, book), () => loadSession(repoPath, tool, book, source, engine));

/** The sources and target a book's checks show, read once per run. */
export const contextOf = (repoPath: string, book: string, rung: Rung, source: ProjectSource, engine: CheckingEngine): Promise<CheckContext> =>
  keep(keys.context(repoPath, book, rung), () => loadCheckContext(repoPath, book, rung, source, engine));

/** A file of an installed resource (a tW article), read once per run: a resource at a pinned revision never changes. */
export const resourceText = (source: ProjectSource, resourcePath: string, path: string): Promise<string> =>
  keep(`text|${resourcePath}|${path}`, () => source.readText(resourcePath, path));
export const keptResourceText = (resourcePath: string, path: string): string | undefined => kept(`text|${resourcePath}|${path}`);

// ---- Kept on the device across restarts (#44, slice 44b) ----

const device = keptStore();

/** Writes `value()` under `name`, one write at a time: one asked for meanwhile runs once after it, with the latest value. */
const writing = new Map<string, { again: boolean }>();
const save = (name: string, value: () => unknown): void => {
  const running = writing.get(name);
  if (running) {
    running.again = true;
    return;
  }
  const state = { again: false };
  writing.set(name, state);
  void device.write(name, value()).finally(() => {
    writing.delete(name);
    if (state.again) save(name, value);
  });
};

/** Which Door43 repositories are projects in the Rust tC4's format, by `host/owner/name` (#56): answers that have
 * landed, so a list shown again sorts at once. Kept on the device with the list. */
export const knownFormats = new Map<string, boolean>();
/** A repository's key in `knownFormats`. */
export const formatKey = (host: string, repo: { owner: string; name: string }): string => `${host}/${repo.owner}/${repo.name}`;

const SESSION = 'session';
const PROGRESS = 'progress';
const projectsName = (host: string, username: string) => keptName('projects', host, username);

/** The username kept beside the token for `host` (it is not a secret), or null. */
let sessionKept: string | null = null;
export const keptUsername = async (host: string): Promise<string | null> => {
  const kept = (await device.read(SESSION)) as { host?: unknown; username?: unknown } | undefined;
  sessionKept = kept?.host === host && typeof kept.username === 'string' && kept.username ? kept.username : null;
  return sessionKept;
};
export const keepUsername = (host: string, username: string): void => {
  if (username === sessionKept) return;
  sessionKept = username;
  save(SESSION, () => ({ host, username }));
};

/** Keeps Door43's list for this checker, in this run and on the device, with the format answers known for it. With
 * no list, it saves the kept one again: after more answers have landed. */
export const keepProjects = (host: string, username: string, repos?: Door43Repo[]): void => {
  const key = keys.projects(host, username);
  if (repos) keepNow(key, repos);
  save(projectsName(host, username), () => {
    const list = kept<Door43Repo[]>(key) ?? [];
    const formats = list.flatMap((r) => {
      const isTc = knownFormats.get(formatKey(host, r));
      return isTc === undefined ? [] : [[formatKey(host, r), isTc] as const];
    });
    return { host, username, repos: list, formats: Object.fromEntries(formats) };
  });
};

type Counts = { decided: number; total: number } | null;
/** The last progress counted for each project's books: repo path → `${book} ${tool}` → counts, null when its list
 * cannot be shown. */
const progressKept = new Map<string, Record<string, Counts>>();

/** A session that landed is the book's progress now. */
function noteProgress(key: string, value: unknown): void {
  if (!key.startsWith('session|')) return;
  const [, repoPath, tool, book] = key.split('|');
  const session = value as Session;
  const counts = session.state === 'ready' ? session.progress : null;
  const was = progressKept.get(repoPath)?.[`${book} ${tool}`];
  if (was !== undefined && was?.decided === counts?.decided && was?.total === counts?.total) return;
  progressKept.set(repoPath, { ...progressKept.get(repoPath), [`${book} ${tool}`]: counts });
  save(PROGRESS, () => Object.fromEntries(progressKept));
}

/** The progress last counted for a book and tool, also in an earlier run of the app; undefined when never counted. */
export const keptProgress = (repoPath: string, book: string, tool: Tool): Counts | undefined => progressKept.get(repoPath)?.[`${book} ${tool}`];

/** Reads what this phone kept for the checker into this run, before their projects show: Door43's last list with its
 * format answers, and the books' progress. What is missing or damaged is only read again later. */
export const restoreKept = async (host: string, username: string): Promise<void> => {
  const [projects, progress] = await Promise.all([device.read(projectsName(host, username)), device.read(PROGRESS)]);
  const list = projects as { host?: unknown; username?: unknown; repos?: unknown; formats?: Record<string, boolean> } | undefined;
  const key = keys.projects(host, username);
  // The file's name is made from the host and the username; the record names them too, so two names that read
  // alike (`a.b` and `a-b`) never show one checker's list to the other.
  if (list?.host === host && list.username === username && Array.isArray(list.repos) && !kept(key)) {
    keepNow(key, list.repos as Door43Repo[]);
    for (const [repo, isTc] of Object.entries(list.formats ?? {})) if (!knownFormats.has(repo)) knownFormats.set(repo, isTc);
  }
  if (progress && typeof progress === 'object')
    for (const [repoPath, books] of Object.entries(progress as Record<string, Record<string, Counts>>))
      progressKept.set(repoPath, { ...books, ...progressKept.get(repoPath) });
};
