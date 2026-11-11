import { useCallback, useEffect, useState } from 'react';
import type { CheckingEngine, CheckItem, Tool } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';
import type { Session } from '../session/loadSession';
import { contextOf, keptResourceText, keys, kept, resourceText, sessionOf } from '../session/kept';
import { t } from '../i18n';
import type { Strings } from '../i18n/en';
import { bookName, toolName } from '../i18n/books';
import TopBar from './TopBar';
import ChapterGrid from './ChapterGrid';
import { chapterStates, refOf } from './chapters';
import { gatewayOf } from './checkLabel';
import { noteWithoutAcademyLinks } from './noteText';
import { splitTitle } from './articleTitle';
import ErrorLine from './ErrorLine';
import Skeleton from './Skeleton';
import SyncButton, { useSync } from './SyncButton';
import { stagger } from './stagger';
import { IDLE, failure, type Run } from './load';
import type { CheckContext } from '../session/loadCheckContext';

const STATE_KEY: Record<Exclude<Session['state'], 'ready'>, keyof Strings> = {
  unavailable: 'stateUnavailable',
  unpinned: 'stateUnpinned',
  'not-covered': 'stateNotCovered',
  'old-twl': 'stateOldTwl',
  'versification-unavailable': 'stateVersificationUnavailable',
  'versification-unknown': 'stateVersificationUnknown',
  'versification-unsupported': 'stateVersificationUnsupported',
};

const stateText = (session: Session): string => t(STATE_KEY[session.state as Exclude<Session['state'], 'ready'>], { scheme: session.scheme ?? '' });

type Props = {
  repoPath: string;
  tool: Tool;
  book: string;
  source: ProjectSource;
  engine: CheckingEngine;
  /** The check the checker comes back from: its chapter shows and its verse opens. */
  focus?: number;
  onOpen: (session: Session, index: number) => void;
  onBack: () => void;
  /** The checker signed in: a project in the Rust tC4's format syncs as them. */
  door43: { username: string; token: string };
};

const articleKey = (item: CheckItem) => `${(item.category as string | undefined) ?? 'kt'}/${item.contextId.groupId}`;

export default function CheckList({ repoPath, tool, book, source, engine, focus, onOpen, onBack, door43 }: Props) {
  // What this run has read already shows at once (session/kept.ts).
  const [session, setSession] = useState<Session | null>(() => kept<Session>(keys.session(repoPath, tool, book)) ?? null);
  // Why loading failed, over the list already on screen, which stays.
  const [status, setStatus] = useState<Run<never>>(IDLE);
  const [chapter, setChapter] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [ctx, setCtx] = useState<CheckContext | null>(() =>
    session?.state === 'ready' ? (kept<CheckContext>(keys.context(repoPath, book, session.rung)) ?? null) : null,
  );
  // tW article titles by `category/groupId`, read for the chapter on screen.
  const [titles, setTitles] = useState<Map<string, string>>(() => {
    const known = new Map<string, string>();
    if (!ctx?.twPath) return known;
    for (const key of new Set((session?.state === 'ready' ? session.items : []).map(articleKey))) {
      const md = keptResourceText(ctx.twPath, `payload/${key}.md`);
      if (md !== undefined) known.set(key, splitTitle(md).title ?? '');
    }
    return known;
  });

  const load = useCallback(() => {
    setStatus(IDLE);
    sessionOf(repoPath, tool, book, source, engine).then(setSession, (e: Error) => setStatus({ state: 'failed', message: e.message }));
  }, [repoPath, tool, book, source, engine]);
  useEffect(load, [load]);

  // Sync, then the list reads the project again.
  const { run: syncRun, sync } = useSync(repoPath, door43, source, load);

  const items = session?.state === 'ready' ? session.items : [];
  const focused = focus !== undefined ? items[focus] : undefined;
  // The chapter shown: the one picked, else the focused check's, else the first with checks.
  const shown = chapter ?? (focused ? refOf(focused).chapter : items.length ? refOf(items[0]).chapter : 1);
  const verses: Array<{ verse: string; checks: Array<{ item: CheckItem; index: number }> }> = [];
  items.forEach((item, index) => {
    const ref = refOf(item);
    if (ref.chapter !== shown) return;
    const last = verses[verses.length - 1];
    if (last?.verse === ref.verse) last.checks.push({ item, index });
    else verses.push({ verse: ref.verse, checks: [{ item, index }] });
  });
  const openVerse = focused && refOf(focused).chapter === shown ? refOf(focused).verse : verses[0]?.verse;
  const chapterItems = verses.flatMap((v) => v.checks.map((c) => c.item));
  const chapterProgress = engine.progress(chapterItems);

  // The rows name their checks with the sources' words, so the list reads the book's sources once.
  const rung = session?.state === 'ready' ? session.rung : null;
  useEffect(() => {
    if (!rung) return;
    contextOf(repoPath, book, rung, source, engine).then(setCtx, () => setCtx(null));
  }, [repoPath, book, rung, source, engine]);

  const missing = tool === 'translationWords' && ctx?.twPath ? [...new Set(chapterItems.map(articleKey))].filter((k) => !titles.has(k)) : [];
  const missingKey = missing.join(',');
  useEffect(() => {
    if (!missingKey || !ctx?.twPath) return;
    const twPath = ctx.twPath;
    Promise.all(
      missingKey.split(',').map(async (key): Promise<[string, string]> => {
        const md = await resourceText(source, twPath, `payload/${key}.md`).catch(() => '');
        return [key, splitTitle(md).title ?? ''];
      }),
    ).then((read) => setTitles((old) => new Map([...old, ...read])));
  }, [missingKey, ctx, source]);

  const labelOf = (item: CheckItem) => {
    const words = ctx ? gatewayOf(engine, ctx.panes, item) : null;
    const article = tool === 'translationWords' ? titles.get(articleKey(item)) : undefined;
    // A tN row also shows how its note opens, in the note's language: two notes on the same words stay apart.
    const text = (item.contextId as { occurrenceNote?: string }).occurrenceNote ?? '';
    const note = tool === 'translationNotes' ? engine.noteBlocks(noteWithoutAcademyLinks(text, '').text).find((b) => b.kind !== 'h') : undefined;
    return { label: article || words || String(item.contextId.quoteString ?? ''), quote: article ? words : null, note: note?.text ?? null };
  };
  const title = `${bookName(book)} ${shown}`;

  return (
    <main className="screen">
      <TopBar
        title={title}
        sub={toolName(tool)}
        onBack={onBack}
        onTitle={session?.state === 'ready' ? () => setPicking(true) : undefined}
        actions={<SyncButton syncing={syncRun.state === 'syncing'} onSync={sync} />}
      />
      <ErrorLine text={failure(syncRun) ?? failure(status)} />
      {!session && status.state !== 'failed' && <Skeleton shape="checks" label={t('loadingChecks')} />}
      {session && session.state !== 'ready' && <p>{stateText(session)}</p>}
      {session?.state === 'ready' && (
        <>
          <div className="progress-lines">
            <p data-testid="chapter-progress">{t('chapterProgress', { chapter: shown, ...chapterProgress })}</p>
            <p className="muted" data-testid="progress">
              {t('progress', session.progress)}
            </p>
          </div>
          {session.dropped && (
            <p className="muted" data-testid="dropped">
              {t('dropped', session.dropped)}
            </p>
          )}
          <div className="verses" key={shown}>
            {verses.map(({ verse, checks }, v) => {
              const p = engine.progress(checks.map((c) => c.item));
              return (
                <details key={verse} className="verse enter" style={stagger(v)} data-testid="verse" open={verse === openVerse}>
                  <summary>
                    <span>
                      {shown}:{verse} · {t('verseProgress', p)}
                    </span>
                    {p.decided === p.total && <span className="done-mark" aria-hidden="true">✓</span>}
                  </summary>
                  {checks.map(({ item, index }, row) => {
                    const done = engine.progress([item]).decided === 1;
                    const { label, quote, note } = labelOf(item);
                    return (
                      <button key={`${item.contextId.checkId}-${index}`} className="row check-row" style={stagger(row)} data-testid="check-row" onClick={() => onOpen(session, index)}>
                        <span className="check-name">
                          <span data-testid="row-label">{label}</span>
                          {quote && (
                            <span data-testid="row-quote" className="muted">
                              {quote}
                            </span>
                          )}
                          {note && (
                            <span data-testid="row-note" className="muted row-note">
                              {note}
                            </span>
                          )}
                        </span>
                        <span className="muted">{done ? t('checked') : ''}</span>
                      </button>
                    );
                  })}
                </details>
              );
            })}
          </div>
        </>
      )}
      <ChapterGrid
        open={picking}
        chapters={chapterStates(book, items, engine)}
        current={shown}
        onPick={(c) => {
          setChapter(c);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </main>
  );
}
