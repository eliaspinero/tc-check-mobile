// What this run of the app has already read, by key (#44): a screen that comes back shows it at once, with no
// skeleton, and reads again only what is not kept. Two screens that want the same thing at the same time share
// one read. It lives above the screens, because App's go() unmounts them.
//
// As tC4's caches (STORAGE.md §3.6), this never decides what exists: a missing entry only means reading again.
// What changes a project replaces its entries: a decision (the new session), a Sync, a resource installed.
import type { CheckingEngine, Tool } from '../engine/CheckingEngine';
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
