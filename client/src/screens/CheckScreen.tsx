import { useEffect, useState } from 'react';
import type { ArticleBlock, CheckingEngine, CheckItem, Selection, Tool } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';
import type { Session } from '../session/loadSession';
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

type Props = {
  repoPath: string;
  book: string;
  tool: Tool;
  session: Session;
  index: number;
  source: ProjectSource;
  engine: CheckingEngine;
  onIndex: (index: number) => void;
  onBack: () => void;
};

/** The target verse text with each selectable word wrapped, punctuation and spacing kept as written. */
function TargetVerse({ text, words, selected }: { text: string; words: string[]; selected: number[] }) {
  const sel = new Set(selected);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  words.forEach((w, i) => {
    const at = text.indexOf(w, cursor);
    if (at < 0) return;
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(sel.has(i) ? <mark key={i} data-sel className="sel">{w}</mark> : <span key={i}>{w}</span>);
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
        const lines = md.split(/\r?\n/);
        const first = lines.findIndex((l) => l.startsWith('# '));
        const title = first >= 0 ? lines[first].slice(2).trim() : c.groupId;
        setArticle({ title, blocks: engine.articleBlocks(lines.filter((_, i) => i !== first).join('\n')) });
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

export default function CheckScreen({ repoPath, book, tool, session, index, source, engine, onIndex, onBack }: Props) {
  const [ctx, setCtx] = useState<CheckContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const total = session.items.length;
  const next = () => index < total - 1 && onIndex(index + 1);
  const prev = () => index > 0 && onIndex(index - 1);
  const swipe = useSwipe(next, prev);

  useEffect(() => {
    loadCheckContext(repoPath, book, session.rung, source, engine).then(setCtx, (e: Error) => setError(e.message));
  }, [repoPath, book, session.rung, source, engine]);

  const item = session.items[index];
  const ref = refOf(item);
  const quote = item.contextId.quote as string | Array<{ word: string }>;
  const occurrence = Number(item.contextId.occurrence);
  const targetText = ctx ? engine.verseText(verseOf(ctx.target, item)) : '';
  const target = ctx ? engine.targetTokens(targetText, item.selections as Selection[] | false) : null;

  return (
    <main className="screen check" data-testid="check-screen" {...swipe}>
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
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {ctx && (
        <>
          <Help item={item} tool={tool} ctx={ctx} source={source} engine={engine} />
          {/* The checker's own verse right under the help, so it is in view without scrolling; the sources follow in full. */}
          <section className="pane target" data-testid="target" dir={ctx.dir}>
            <span className="lb">{t('yourTranslation')}</span>
            <p>{target && <TargetVerse text={targetText} words={target.tokens} selected={target.selected} />}</p>
          </section>
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
