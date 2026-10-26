// One checking session: the derived check list of (tool, book) in a project, or the state that
// says why it cannot open. The states are tC4's (Check.jsx preflight, from resolve.ts).
import type { CheckingEngine, CheckItem, Coverage, ResourcePin, ResourcesFile, Tool } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';
import { installedPathOf } from '../resources/installPins';

export type SessionState = 'ready' | 'unavailable' | 'unpinned' | 'not-covered' | 'old-twl';

export interface Session {
  state: SessionState;
  items: CheckItem[];
  progress: { decided: number; total: number };
  /** Checks the project's versification cannot place; shown, never silently dropped. */
  dropped: { count: number; scheme: string } | null;
  /** The pin the list derives from (ready), or the one that is missing (unavailable). */
  pin: ResourcePin | null;
  rung: 'primary' | 'fallback' | null;
}

const SLOT = { translationWords: 'translationWordsLinks', translationNotes: 'translationNotes' } as const;
/** Every unfoldingWord helps resource is in the eng frame (BURRITO-SPEC §5.2). */
const RESOURCE_FRAME = 'eng';

const empty = (state: SessionState, pin: ResourcePin | null = null): Session => ({
  state,
  items: [],
  progress: { decided: 0, total: 0 },
  dropped: null,
  pin,
  rung: null,
});

export const scopeOf = (metadata: Record<string, unknown>): Record<string, string[]> =>
  ((metadata as { type?: { flavorType?: { currentScope?: Record<string, string[]> } } }).type?.flavorType?.currentScope ?? {});

/** Books an installed pin holds, read from its `ingredients/<BOOK>.tsv` names, for each pin of this tool's
 * slot that records no `books` (projects pinned before tC4 D41). Keyed `repoPath@sha` as tC4's Coverage. */
const localCoverage = async (resources: ResourcesFile, tool: Tool, local: string[], source: ProjectSource): Promise<Coverage> => {
  const coverage: Coverage = {};
  for (const rung of ['primary', 'fallback'] as const) {
    const pin = resources.languageSets?.[rung]?.[SLOT[tool]];
    if (!pin || pin.books) continue;
    const path = await installedPathOf(pin, local, source);
    if (!path) continue;
    const meta = (await source.readMetadata(path)) as { ingredients?: Record<string, unknown> };
    coverage[`${pin.repoPath}@${pin.sha}`] = Object.keys(meta.ingredients ?? {})
      .map((k) => /^ingredients\/([1-3A-Z]{3})\.tsv$/.exec(k)?.[1])
      .filter((b): b is string => !!b);
  }
  return coverage;
};

export const loadSession = async (repoPath: string, tool: Tool, book: string, source: ProjectSource, engine: CheckingEngine): Promise<Session> => {
  const resources: ResourcesFile | null = await source.readResources(repoPath);
  if (!resources) return empty('unpinned');
  const local = await source.listLocal();
  const resolution = engine.resolve(resources, tool, book, await localCoverage(resources, tool, local, source));
  if (resolution.oldTwl) return empty('old-twl');
  if (!resolution.pin || !resolution.rung) {
    const anyPin = resources.languageSets?.primary?.[SLOT[tool]] ?? resources.languageSets?.fallback?.[SLOT[tool]];
    return empty(anyPin ? 'not-covered' : 'unpinned');
  }
  const listPath = await installedPathOf(resolution.pin, local, source);
  if (!listPath) return { ...empty('unavailable', resolution.pin), rung: resolution.rung };

  let twArticles: Set<string> | undefined;
  if (tool === 'translationWords') {
    const twPin = resources.languageSets[resolution.rung].translationWords;
    const twPath = twPin ? await installedPathOf(twPin, local, source) : null;
    if (!twPin || !twPath) return { ...empty('unavailable', twPin ?? null), rung: resolution.rung };
    twArticles = engine.twArticles(await source.readMetadata(twPath));
  }

  const [tsv, decisions, metadata] = await Promise.all([
    source.readText(listPath, `${book.toUpperCase()}.tsv`),
    source.readDecisions(repoPath, tool, book.toUpperCase()),
    source.readMetadata(repoPath),
  ]);
  const { items, unplaceable } = await engine.deriveItems({
    tsv,
    tool,
    bookId: book.toLowerCase(),
    from: RESOURCE_FRAME,
    to: RESOURCE_FRAME,
    schemes: {},
    saved: (decisions?.decisions ?? []) as unknown as CheckItem[],
    keepInvalidated:
      !!decisions?.resource &&
      decisions.resource.repoPath.toLowerCase() === resolution.pin.repoPath.toLowerCase() &&
      decisions.resource.sha === resolution.pin.sha,
    scopeRanges: scopeOf(metadata)[book.toUpperCase()] ?? [],
    twArticles,
  });
  return {
    state: 'ready',
    items,
    progress: engine.progress(items),
    dropped: unplaceable.length ? { count: unplaceable.length, scheme: RESOURCE_FRAME } : null,
    pin: resolution.pin,
    rung: resolution.rung,
  };
};
