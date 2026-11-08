import { useEffect, useRef, useState } from 'react';
import type { ArticleBlock, CheckingEngine, CheckItem, DecisionPatch, Selection, Tool } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';
import { loadSession, type Session } from '../session/loadSession';
import { decide } from '../session/decide';
import { loadCheckContext, type CheckContext } from '../session/loadCheckContext';
import { t } from '../i18n';
import { bookName, toolName } from '../i18n/books';
import { useSwipe } from './useSwipe';
import TopBar from './TopBar';
import ChapterGrid from './ChapterGrid';
import Markdown from './Markdown';
import { chapterStates, refOf } from './chapters';
import { gatewayOf, verseOf } from './checkLabel';
import { noteWithoutAcademyLinks } from './noteText';
import { splitTitle } from './articleTitle';
import ErrorLine from './ErrorLine';
import Skeleton from './Skeleton';
import { IDLE, LOADING, failure, ready, type Load, type Run } from './load';

type Props = {
  repoPath: string;
  book: string;
  tool: Tool;
  session: Session;
  index: number;
  source: ProjectSource;
  engine: CheckingEngine;
  onIndex: (index: number) => void;
  /** The session again after a decision, so the list and its progress follow at once. */
  onDecided: (session: Session) => void;
  onBack: () => void;
};

/** The target verse text with each selectable word wrapped, punctuation and spacing kept as written.
 * With `onToggle`, a word is a toggle (tap, or Enter or Space): a span, so a long press still selects
 * and copies the verse's text. */
function TargetVerse({ text, words, selected, onToggle }: { text: string; words: string[]; selected: ReadonlySet<number>; onToggle?: (i: number) => void }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  words.forEach((w, i) => {
    const at = text.indexOf(w, cursor);
    if (at < 0) return;
    if (at > cursor) parts.push(text.slice(cursor, at));
    const on = selected.has(i);
    const toggle = onToggle
      ? {
          role: 'button',
          tabIndex: 0,
          'aria-pressed': on,
          onClick: () => onToggle(i),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            onToggle(i);
          },
        }
      : {};
    // One element whether chosen or not, so a toggle keeps the keyboard and screen-reader focus on it.
    parts.push(
      <span key={i} {...(on && { 'data-sel': true, className: 'sel' })} {...toggle}>
        {w}
      </span>,
    );
    cursor = at + w.length;
  });
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

type Article = { title: string; blocks: ArticleBlock[] };
const articleKey = (item: CheckItem) => `${(item.category as string | undefined) ?? 'kt'}/${item.contextId.groupId}`;

/** The help above the sources: the tW article or the tN note, closed to its title, with a note's Academy articles small under it. */
function Help({ item, tool, ctx, article, open, onToggle, engine, still }: { item: CheckItem; tool: Tool; ctx: CheckContext; article?: Article; open: boolean; onToggle: () => void; engine: CheckingEngine; still: boolean }) {
  const c = item.contextId as { groupId: string; occurrenceNote?: string };
  const id = (name: string) => (still ? undefined : name);

  // A note is titled by the words it is about, as tC4's cards are; its Academy articles become tags.
  const note = tool === 'translationNotes' ? noteWithoutAcademyLinks(c.occurrenceNote ?? '', c.groupId) : null;
  const title = note ? gatewayOf(engine, ctx.panes, item) : (article?.title ?? c.groupId);
  const blocks = note ? engine.noteBlocks(note.text) : (article?.blocks ?? []);

  return (
    <section className="help" data-testid={id('help')}>
      <button className="help-toggle" aria-expanded={open} onClick={onToggle}>
        <span data-testid={id('help-title')} className="help-title">{title}</span>
        <span className="chevron" aria-hidden="true">▾</span>
      </button>
      {/* Always drawn on the check on screen, so opening can grow from nothing; closed, it is out of reach. A check at
          the screen's edge draws its text only while the help is open: a whole tW article twice more would slow the swipe. */}
      <div className="help-more" data-open={open || undefined} {...(!open && { inert: '' })}>
        <div>
          {note && (
            <p data-testid={id('help-refs')} className="tags">
              {note.refs.join(' · ')}
            </p>
          )}
          {blocks.length > 0 && (open || !still) && (
            <div data-testid={id('help-body')} className="help-body">
              <Markdown blocks={blocks} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** What a check shows in the slide: its help, the checker's verse and the sources. `still` is for a neighbour at the
 * screen's edge: it looks the same, and has no test ids, because the check on screen is the one to find. */
function CheckBody({ item, tool, ctx, article, helpOpen, onHelp, journaled, engine, chosen, onToggle, still = false }: {
  item: CheckItem;
  tool: Tool;
  ctx: CheckContext;
  article?: Article;
  helpOpen: boolean;
  onHelp: () => void;
  journaled: boolean;
  engine: CheckingEngine;
  /** The words tapped on this check; with none, its stored selection. */
  chosen?: ReadonlySet<number>;
  onToggle?: (i: number) => void;
  still?: boolean;
}) {
  const id = (name: string) => (still ? undefined : name);
  const quote = item.contextId.quote as string | Array<{ word: string }>;
  const occurrence = Number(item.contextId.occurrence);
  const targetText = engine.verseText(verseOf(ctx.target, item));
  const target = engine.targetTokens(targetText, item.selections as Selection[] | false);
  const decided = decisionOf(engine, item);
  return (
    <>
      <Help item={item} tool={tool} ctx={ctx} article={article} open={helpOpen} onToggle={onHelp} engine={engine} still={still} />
      {ctx.panes.map((pane) => {
        const verse = verseOf(pane.book, item);
        const { tokens, highlighted } = engine.sourceTokens(verse, quote, occurrence);
        const hl = new Set(highlighted);
        return (
          <section key={pane.label} className="pane" data-testid={id(`pane-${pane.label}`)}>
            <span className="lb">{pane.label}</span>
            <p>
              {pane.book === null && <span className="muted">{t('sourceMissing')}</span>}
              {pane.book !== null && !verse && <span className="muted">{t('verseMissing')}</span>}
              {tokens.map((tk, i) => (hl.has(i) ? <mark key={i} data-hl className="hl">{tk.text}</mark> : <span key={i}>{tk.text}</span>))}
            </p>
          </section>
        );
      })}
      {!journaled && <p className="muted">{t('needsJournal')}</p>}
      {/* The checker's own verse last and anchored right above the decide bar (app.css): the help and the sources scroll
          behind it, so it is never lost and the work stays within thumb reach. */}
      <section className="pane target" data-testid={id('target')} dir={ctx.dir}>
        <span className="lb">{t('yourTranslation')}</span>
        <p>
          <TargetVerse text={targetText} words={target.tokens} selected={chosen ?? new Set(target.selected)} onToggle={journaled ? onToggle : undefined} />
        </p>
        {decided && (
          <p className="decided" data-testid={id('decided')} data-status={decided}>
            {t(decided)}
          </p>
        )}
      </section>
    </>
  );
}

/** Decided as the list counts it (tC4 isDecided); an Invalid status shows as Invalid. */
const decisionOf = (engine: CheckingEngine, item: CheckItem) => (engine.progress([item]).decided === 1 ? (item.status === 'invalid' ? 'invalid' : 'valid') : null);

export default function CheckScreen({ repoPath, book, tool, session, index, source, engine, onIndex, onDecided, onBack }: Props) {
  const [context, setContext] = useState<Load<CheckContext>>(LOADING);
  const ctx = ready(context);
  const [picking, setPicking] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // The checks either side open their help once this one has finished opening (its own transition, 0 with reduced
  // motion): drawing two whole tW articles while it grows cost dropped frames. They are off screen, so nobody sees them wait.
  const [peeksOpen, setPeeksOpen] = useState(false);
  useEffect(() => {
    if (!helpOpen) return;
    const more = swipe.content.current!.querySelector(':scope > .help > .help-more')!;
    const opening = parseFloat(getComputedStyle(more).transitionDuration) * 1000;
    const timer = setTimeout(() => setPeeksOpen(true), opening);
    return () => clearTimeout(timer);
  }, [helpOpen]);
  const toggleHelp = () => {
    setPeeksOpen(false);
    setHelpOpen(!helpOpen);
  };
  // tW articles read so far, by category/groupId: the check on screen and those either side, so a swipe lands on a full help.
  const [articles, setArticles] = useState<ReadonlyMap<string, Article>>(new Map());
  const total = session.items.length;
  const swipe = useSwipe(index < total - 1 ? () => onIndex(index + 1) : undefined, index > 0 ? () => onIndex(index - 1) : undefined);

  useEffect(() => {
    loadCheckContext(repoPath, book, session.rung, source, engine).then(
      (value) => setContext({ state: 'ready', value }),
      (e: Error) => setContext({ state: 'failed', message: e.message }),
    );
  }, [repoPath, book, session.rung, source, engine]);

  const item = session.items[index];
  const twPath = tool === 'translationWords' ? ctx?.twPath : undefined;
  const missingKey = twPath ? [...new Set([session.items[index - 1], item, session.items[index + 1]].filter(Boolean).map(articleKey))].filter((k) => !articles.has(k)).join(',') : '';
  useEffect(() => {
    if (!missingKey || !twPath) return;
    Promise.all(
      missingKey.split(',').map(async (key): Promise<[string, Article]> => {
        const groupId = key.split('/')[1];
        try {
          const { title, body } = splitTitle(await source.readText(twPath, `payload/${key}.md`));
          return [key, { title: title ?? groupId, blocks: engine.articleBlocks(body) }];
        } catch {
          return [key, { title: groupId, blocks: engine.articleBlocks(t('articleMissing')) }];
        }
      }),
    ).then((read) => setArticles((old) => new Map([...old, ...read])));
  }, [missingKey, twPath, source, engine]);
  const ref = refOf(item);
  const targetText = ctx ? engine.verseText(verseOf(ctx.target, item)) : '';
  const target = ctx ? engine.targetTokens(targetText, item.selections as Selection[] | false) : null;
  // The words tapped on a check; on another check, or before the first tap, the stored selection.
  const [tapped, setTapped] = useState<{ index: number; words: Set<number> } | null>(null);
  const chosen: ReadonlySet<number> = tapped?.index === index ? tapped.words : new Set(target?.selected ?? []);
  const toggle = (i: number) => {
    const words = new Set(chosen);
    if (words.has(i)) words.delete(i);
    else words.add(i);
    setTapped({ index, words });
  };

  const [status, setStatus] = useState<Run<{ state: 'saving' }>>(IDLE);
  const record = async (patch: DecisionPatch) => {
    if (!session.pin) return;
    setStatus({ state: 'saving' });
    try {
      await decide({ repoPath, tool, item, patch, pin: session.pin }, source);
      onDecided(await loadSession(repoPath, tool, book, source, engine));
      setTapped(null);
      setStatus(IDLE);
    } catch (e) {
      setStatus({ state: 'failed', message: (e as Error).message });
    }
  };
  const mark = (button: 'valid' | 'invalid') => record(engine.patch(button, targetText, [...chosen]));
  const decided = decisionOf(engine, item);
  const last = index === total - 1;
  const after = last ? null : refOf(session.items[index + 1]);
  const afterRef = after && (after.chapter !== ref.chapter || after.verse !== ref.verse) ? `${after.chapter}:${after.verse}` : null;
  const bigNext = decided !== null || !session.journaled;

  // The bar's height changes with the decision and the phone's text size; the anchored verse sits on top of it (--bar in app.css).
  const screen = useRef<HTMLElement>(null);
  const bar = useRef<HTMLElement>(null);
  // When it grows or shrinks (Next comes in on a decision, or goes on a check not decided), the bar and the verse start
  // where they were and slide to their new place together (app.css settle), instead of jumping. This runs after layout
  // and before the frame is drawn. `data-grew` stays once set: taking it off would let the screen's own fade-in
  // play on the bar again (a flicker). Each change flips it between `a` and `b`, two names for the same move, so the
  // move plays again.
  useEffect(() => {
    const main = screen.current!;
    const sheet = bar.current!;
    let was = 0;
    const seen = new ResizeObserver(() => {
      const now = sheet.offsetHeight;
      main.style.setProperty('--bar', `${now}px`);
      if (was && now !== was) {
        main.style.setProperty('--grew', `${now - was}px`);
        main.dataset.grew = main.dataset.grew === 'a' ? 'b' : 'a';
      }
      was = now;
    });
    seen.observe(sheet);
    return () => seen.disconnect();
  }, []);

  return (
    <main ref={screen} className={session.journaled ? 'screen check deciding' : 'screen check'} data-testid="check-screen" {...swipe.area}>
      <TopBar
        title={`${bookName(book)} ${ref.chapter}:${ref.verse}`}
        titleTestId="check-title"
        sub={
          <span data-testid="check-header">
            {toolName(tool)} · {index + 1} / {total}
          </span>
        }
        onBack={onBack}
        onTitle={() => setPicking(true)}
      />
      <ErrorLine text={failure(context) ?? failure(status)} />
      {/* The check's content: it follows a swipe, with the checks before and after it at its edges. */}
      <div className="slide" ref={swipe.content}>
        {context.state === 'loading' && <Skeleton shape="check" label={t('loadingCheck')} />}
        {ctx && (
          <>
            {/* The checks either side wait just past the screen, whole, so a swipe shows what will land. Out of reach until then. */}
            {[index - 1, index + 1].map((i) => {
              const near = session.items[i];
              if (!near) return null;
              const side = i < index ? 'prev' : 'next';
              return (
                <div key={side} className={`peek ${side}`} data-testid={`peek-${side}`} aria-hidden="true" {...{ inert: '' }}>
                  <CheckBody item={near} tool={tool} ctx={ctx} article={articles.get(articleKey(near))} helpOpen={helpOpen && peeksOpen} onHelp={() => undefined} journaled={session.journaled} engine={engine} still />
                </div>
              );
            })}
            <CheckBody item={item} tool={tool} ctx={ctx} article={articles.get(articleKey(item))} helpOpen={helpOpen} onHelp={toggleHelp} journaled={session.journaled} engine={engine} chosen={chosen} onToggle={toggle} />
          </>
        )}
      </div>
      {/* tC4's Ocean sheet (owner's design B3·1). Deciding comes first; once decided, or where the project takes
          no decisions, one large Next says which verse it goes to. There is only ever one Next. */}
      <nav ref={bar} className="bottombar" data-testid="decide-bar" data-status={decided ?? undefined}>
        <div className="progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${(index + 1) / total})` }} />
        </div>
        <div className="nav-row">
          <button className="link" onClick={swipe.prev} disabled={index === 0}>
            ‹ {t('previous')}
          </button>
          <span className="count">
            {index + 1} / {total}
          </span>
          {bigNext ? (
            <span className="link-space" />
          ) : (
            <button className="link" onClick={swipe.next} disabled={last}>
              {t('next')} ›
            </button>
          )}
        </div>
        {session.journaled && ctx && (
          <div className="decide" data-decided={decided ?? undefined}>
            <button className="invalid" aria-pressed={decided === 'invalid'} onClick={() => mark('invalid')} disabled={status.state === 'saving'}>
              <span className="mark" aria-hidden="true">✕</span>
              {t('invalid')}
            </button>
            <button className="valid" aria-pressed={decided === 'valid'} onClick={() => mark('valid')} disabled={status.state === 'saving'}>
              <span className="mark" aria-hidden="true">✓</span>
              {status.state === 'saving' ? t('saving') : t('valid')}
            </button>
          </div>
        )}
        {bigNext && (
          <button className="next" onClick={swipe.next} disabled={last}>
            <span>{t('next')}</span>
            {/* Where Next goes, when it leaves this verse. */}
            <span className="next-to">{afterRef && `${afterRef} `}›</span>
          </button>
        )}
      </nav>
      <ChapterGrid
        open={picking}
        chapters={chapterStates(book, session.items, engine)}
        current={ref.chapter}
        onPick={(chapter) => {
          setPicking(false);
          const first = session.items.findIndex((i) => refOf(i).chapter === chapter);
          if (first >= 0) onIndex(first);
        }}
        onClose={() => setPicking(false)}
      />
    </main>
  );
}
