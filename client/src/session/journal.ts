// The project's §8 journal on this phone: read it, fold it, and write a decision into it the way
// tC4 does. The journal is the record; `checking/<tool>/<BOOK>.json` is derived from it.
import type { CheckingEngine, CheckItem, DecisionPatch, DecisionResource, JournalFold, Tool } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';
import { deviceSecret } from '../device/deviceSecret';

const JOURNAL = 'checking/journal/';

export interface Journal {
  /** Every file under the journal folder, as the server listed them. */
  paths: string[];
  events: unknown[];
  fold: JournalFold;
}

// One read per project: the book picker, the list and each decision share it. Only this phone writes
// the project's journal here, so the cache follows its own writes; a Sync that brings other actors'
// files forgets it (forgetJournal).
const cache = new Map<string, Promise<Journal | null>>();

const read = async (repoPath: string, source: ProjectSource, engine: CheckingEngine): Promise<Journal | null> => {
  const paths = (await source.listPaths(repoPath)).filter((p) => p.startsWith(JOURNAL));
  const segments = paths.filter((p) => p.endsWith('.action.json'));
  if (segments.length === 0) return null;
  const read = await Promise.all(
    segments.map(async (ipath) => {
      const verdict = await engine.journal.readSegment(await source.readText(repoPath, ipath));
      if (!verdict.ok) throw new Error(`${ipath}: ${verdict.reason}`);
      return verdict.events;
    }),
  );
  const events = read.flat();
  return { paths, events, fold: engine.journal.fold(events) };
};

/** The project's journal, or null when it has none (a project tC4 never opened). An invalid segment
 * stops the read, as it stops tC4's (R-8.7.8): the phone never decides over a journal it cannot read. */
export const readJournal = (repoPath: string, source: ProjectSource, engine: CheckingEngine): Promise<Journal | null> => {
  let journal = cache.get(repoPath);
  if (!journal) {
    journal = read(repoPath, source, engine);
    journal.catch(() => cache.delete(repoPath));
    cache.set(repoPath, journal);
  }
  return journal;
};

/** Read the journal again next time: files came in from elsewhere (a Sync). */
export const forgetJournal = (repoPath: string): void => void cache.delete(repoPath);

export interface DecideInput {
  repoPath: string;
  tool: Tool;
  book: string;
  item: CheckItem;
  patch: DecisionPatch;
  /** The resource the list was derived from, stamped on the decision file (§5.2 `resource`, D30). */
  resource: DecisionResource;
}

/** Record one decision. The sealed segment is written first, then the derived decision file:
 * once the segment is on disk the decision is kept, whatever happens to the second write. */
export const decide = async (input: DecideInput, source: ProjectSource, engine: CheckingEngine): Promise<void> => {
  const { repoPath, tool, book } = input;
  const [journal, stored, secret] = await Promise.all([
    readJournal(repoPath, source, engine),
    source.readDecisions(repoPath, tool, book.toUpperCase()),
    deviceSecret(engine.journal.newSecret),
  ]);
  if (!journal || !engine.journal.hasBook(journal.fold, book)) throw new Error(`${repoPath} has no journal for ${book}`);
  // A decision file stamped with another resource belongs to the gateway-change flow (tC4 D59): refuse.
  const stamped = stored?.resource?.sha ? { ...stored.resource, sha: stored.resource.sha } : null;
  if (stamped && (stamped.repoPath.toLowerCase() !== input.resource.repoPath.toLowerCase() || stamped.sha !== input.resource.sha))
    throw new Error(`the decisions of ${book} were made against ${stamped.repoPath} @ ${stamped.sha}, not this list's resource`);

  const actor = await engine.journal.actorId(secret, repoPath);
  const actorIpath = `${JOURNAL}${actor}/actor.json`;
  if (!journal.paths.includes(actorIpath)) {
    await source.writeText(repoPath, actorIpath, engine.journal.actorDoc(actor, new Date().toISOString()), { register: false, bak: false });
    journal.paths.push(actorIpath);
  }

  const segment = await engine.journal.decide({ ...journal, actor, tool, book, item: input.item, patch: input.patch, now: () => Date.now() });
  if (segment) {
    const ipath = `${JOURNAL}${actor}/segments/${segment.name}`;
    await source.writeText(repoPath, ipath, segment.bytes, { register: false, bak: false });
    journal.paths.push(ipath);
    journal.events.push(...segment.events);
    journal.fold = engine.journal.fold(journal.events);
  }
  const file = engine.journal.decisionFile(journal.fold, tool, book, stamped ?? input.resource);
  if (file !== null) await source.writeText(repoPath, `checking/${tool}/${book.toUpperCase()}.json`, file, { register: true, bak: true });
};
