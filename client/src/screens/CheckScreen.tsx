import { useEffect, useState } from 'react';
import type { ArticleBlock, CheckingEngine, CheckItem, DecisionPatch, Selection, Tool } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';
import { loadSession, type Session } from '../session/loadSession';
import { decide } from '../session/journal';
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

/** The help above the sources: the tW article or the tN note, closed to its title and first block. */
function Help({ item, tool, ctx, source, engine }: { item: CheckItem; tool: Tool; ctx: CheckContext; source: ProjectSource; engine: CheckingEngine }) {
  const [article, setArticle] = useState<{ title: string; blocks: ArticleBlock[] } | null>(null);
  const [open, setOpen] = useState(false);
  const c = item.contextId as { groupId: string; occurrenceNote?: string };
  const category = (item.category as string | undefined) ?? 'kt';

  useEffect(() => {
    setArticle(null);
    if (tool !== 'translationWords' || !ctx.twPath) return;
    // A swipe moves on before a slow read answers: an answer for a check no longer shown is dropped.
    let current = true;
    source.readText(ctx.twPath, `payload/${category}/${c.groupId}.md`).then(
      (md) => {
        if (!current) return;
        const { title, body } = splitTitle(md);
        setArticle({ title: title ?? c.groupId, blocks: engine.articleBlocks(body) });
      },
      () => current && setArticle({ title: c.groupId, blocks: engine.articleBlocks(t('articleMissing')) }),
    );
    return () => {
      current = false;
    };
  }, [tool, ctx.twPath, category, c.groupId, source, engine]);

  // A note is titled by the words it is about, as tC4's cards are; its Academy articles become tags.
  const note = tool === 'translationNotes' ? noteWithoutAcademyLinks(c.occurrenceNote ?? '', c.groupId) : null;
  const title = note ? gatewayOf(engine, ctx.panes, item) : (article?.title ?? c.groupId);
  const blocks = note ? engine.noteBlocks(note.text) : (article?.blocks ?? []);
  // Closed, the help shows its first block; a heading first shows the paragraph under it.
  const preview = blocks.find((b) => b.kind !== 'h');

  return (
    <section className="help" data-testid="help">
      <button className="help-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span data-testid="help-title" className="help-title">{title}</span>
        <span className="chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {note && (
        <p data-testid="help-refs" className="tags">
          {note.refs.join(' · ')}
        </p>
      )}
      {blocks.length > 0 && (
        <div data-testid="help-body" className={open ? 'help-body' : 'help-body clamp'}>
          <Markdown blocks={open ? blocks : preview ? [preview] : []} />
        </div>
      )}
    </section>
  );
}

export default function CheckScreen({ repoPath, book, tool, session, index, source, engine, onIndex, onDecided, onBack }: Props) {
  const [context, setContext] = useState<Load<CheckContext>>(LOADING);
  const ctx = ready(context);
  const [picking, setPicking] = useState(false);
  const total = session.items.length;
  const next = () => index < total - 1 && onIndex(index + 1);
  const prev = () => index > 0 && onIndex(index - 1);
  const swipe = useSwipe(next, prev);

  useEffect(() => {
    loadCheckContext(repoPath, book, session.rung, source, engine).then(
      (value) => setContext({ state: 'ready', value }),
      (e: Error) => setContext({ state: 'failed', message: e.message }),
    );
  }, [repoPath, book, session.rung, source, engine]);

  const item = session.items[index];
  const ref = refOf(item);
  const quote = item.contextId.quote as string | Array<{ word: string }>;
  const occurrence = Number(item.contextId.occurrence);
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
      await decide(
        { repoPath, tool, book, item, patch, resource: { repoPath: session.pin.repoPath, version: session.pin.version, sha: session.pin.sha, languageSet: session.rung ?? undefined } },
        source,
        engine,
      );
      onDecided(await loadSession(repoPath, tool, book, source, engine));
      setTapped(null);
      setStatus(IDLE);
    } catch (e) {
      setStatus({ state: 'failed', message: (e as Error).message });
    }
  };
  const mark = (button: 'valid' | 'invalid') => record(engine.journal.patch(button, targetText, [...chosen]));
  // Decided as the list counts it (tC4 isDecided); an Invalid status shows as Invalid.
  const decided = engine.progress([item]).decided === 1 ? (item.status === 'invalid' ? 'invalid' : 'valid') : null;

  return (
    <main className={session.journaled ? 'screen check deciding' : 'screen check'} data-testid="check-screen" {...swipe}>
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
      {ctx && (
        <>
          <Help item={item} tool={tool} ctx={ctx} source={source} engine={engine} />
          {/* The checker's own verse right under the help, so it is in view without scrolling; the sources follow in full. */}
          <section className="pane target" data-testid="target" dir={ctx.dir}>
            <span className="lb">{t('yourTranslation')}</span>
            <p>{target && <TargetVerse text={targetText} words={target.tokens} selected={chosen} onToggle={session.journaled ? toggle : undefined} />}</p>
            {decided && (
              <p className="decided" data-testid="decided">
                {t(decided)}
              </p>
            )}
          </section>
          {!session.journaled && <p className="muted">{t('needsJournal')}</p>}
          {ctx.panes.map((pane) => {
            const verse = verseOf(pane.book, item);
            const { tokens, highlighted } = engine.sourceTokens(verse, quote, occurrence);
            const hl = new Set(highlighted);
            return (
              <section key={pane.label} className="pane" data-testid={`pane-${pane.label}`}>
                <span className="lb">{pane.label}</span>
                <p>
                  {pane.book === null && <span className="muted">{t('sourceMissing')}</span>}
                  {pane.book !== null && !verse && <span className="muted">{t('verseMissing')}</span>}
                  {tokens.map((tk, i) => (hl.has(i) ? <mark key={i} data-hl className="hl">{tk.text}</mark> : <span key={i}>{tk.text}</span>))}
                </p>
              </section>
            );
          })}
        </>
      )}
      <nav className="bottombar">
        {session.journaled && ctx && (
          <div className="decide">
            <button className="invalid" onClick={() => mark('invalid')} disabled={status.state === 'saving'}>
              {t('invalid')}
            </button>
            <button className="valid" onClick={() => mark('valid')} disabled={status.state === 'saving'}>
              {status.state === 'saving' ? t('saving') : t('valid')}
            </button>
          </div>
        )}
        <button onClick={prev} disabled={index === 0}>
          ‹ {t('previous')}
        </button>
        <button className="primary" onClick={next} disabled={index === total - 1}>
          {t('next')} ›
        </button>
      </nav>
      {picking && (
        <ChapterGrid
          chapters={chapterStates(book, session.items, engine)}
          current={ref.chapter}
          onPick={(chapter) => {
            setPicking(false);
            const first = session.items.findIndex((i) => refOf(i).chapter === chapter);
            if (first >= 0) onIndex(first);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </main>
  );
}
