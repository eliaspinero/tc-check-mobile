import { useEffect, useState } from 'react';
import type { CheckingEngine, CheckItem, DerivedBook, Selection, Tool } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';
import type { Session } from '../session/loadSession';
import { loadCheckContext, type CheckContext } from '../session/loadCheckContext';
import { useSwipe } from './useSwipe';

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

const verseOf = (book: DerivedBook | null, item: CheckItem) => {
  const r = item.contextId.reference as { chapter?: unknown; verse?: unknown };
  return book?.chapters[String(r.chapter)]?.[String(r.verse)];
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

/** The help above the sources: the tW article's title and first lines, or the tN note. */
function Help({ item, tool, ctx, source }: { item: CheckItem; tool: Tool; ctx: CheckContext; source: ProjectSource }) {
  const [article, setArticle] = useState<{ title: string; body: string } | null>(null);
  const [open, setOpen] = useState(false);
  const c = item.contextId as { groupId: string; occurrenceNote?: string };
  const category = (item.category as string | undefined) ?? 'kt';

  useEffect(() => {
    setArticle(null);
    if (tool !== 'translationWords' || !ctx.twPath) return;
    source.readText(ctx.twPath, `payload/${category}/${c.groupId}.md`).then(
      (md) => {
        const lines = md.split(/\r?\n/);
        const title = (lines.find((l) => l.startsWith('# ')) ?? `# ${c.groupId}`).slice(2).trim();
        const body = lines.filter((l) => !l.startsWith('# ')).map((l) => l.replace(/^#+\s*/, ''));
        setArticle({ title, body: body.join('\n').trim() });
      },
      () => setArticle({ title: c.groupId, body: 'This article is not in the installed translationWords resource.' }),
    );
  }, [tool, ctx.twPath, category, c.groupId, source]);

  if (tool === 'translationNotes')
    return (
      <section className="help">
        <p data-testid="help-title" className="help-title">{c.groupId}</p>
        <p data-testid="help-body" className={open ? '' : 'clamp'} onClick={() => setOpen(!open)}>{c.occurrenceNote}</p>
      </section>
    );
  return (
    <section className="help">
      <p data-testid="help-title" className="help-title">{article?.title ?? c.groupId}</p>
      {article && (
        <p data-testid="help-body" className={open ? 'pre' : 'clamp pre'} onClick={() => setOpen(!open)}>
          {article.body}
        </p>
      )}
    </section>
  );
}

export default function CheckScreen({ repoPath, book, tool, session, index, source, engine, onIndex, onBack }: Props) {
  const [ctx, setCtx] = useState<CheckContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const total = session.items.length;
  const swipe = useSwipe(
    () => index < total - 1 && onIndex(index + 1),
    () => index > 0 && onIndex(index - 1),
  );

  useEffect(() => {
    loadCheckContext(repoPath, book, session.rung, source, engine).then(setCtx, (e: Error) => setError(e.message));
  }, [repoPath, book, session.rung, source, engine]);

  const item = session.items[index];
  const r = item.contextId.reference as { chapter?: unknown; verse?: unknown };
  const quote = item.contextId.quote as string | Array<{ word: string }>;
  const occurrence = Number(item.contextId.occurrence);
  const targetText = ctx ? engine.verseText(verseOf(ctx.target, item)) : '';
  const target = ctx ? engine.targetTokens(targetText, item.selections as Selection[] | false) : null;

  return (
    <main className="screen check" data-testid="check-screen" {...swipe}>
      <div className="check-top">
        <button onClick={onBack}>Back</button>
        <span data-testid="check-header" className="muted">
          {book} {String(r.chapter)}:{String(r.verse)} · {tool === 'translationWords' ? 'tW' : 'tN'} · {index + 1} / {total}
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {ctx && (
        <>
          <Help item={item} tool={tool} ctx={ctx} source={source} />
          {ctx.panes.map((pane) => {
            const verse = verseOf(pane.book, item);
            const { tokens, highlighted } = engine.sourceTokens(verse, quote, occurrence);
            const hl = new Set(highlighted);
            return (
              <section key={pane.label} className="pane" data-testid={`pane-${pane.label}`}>
                <span className="lb">{pane.label}</span>
                <p>
                  {pane.book === null && <span className="muted">This source isn't on this device.</span>}
                  {pane.book !== null && !verse && <span className="muted">This source has no text for this verse.</span>}
                  {tokens.map((t, i) => (hl.has(i) ? <mark key={i} data-hl className="hl">{t.text}</mark> : <span key={i}>{t.text}</span>))}
                </p>
              </section>
            );
          })}
          <section className="pane target" data-testid="target" dir={ctx.dir}>
            <span className="lb">Target text</span>
            <p>{target && <TargetVerse text={targetText} words={target.tokens} selected={target.selected} />}</p>
          </section>
        </>
      )}
      <p className="muted swipe-hint">Swipe left for the next check, right for the previous one.</p>
    </main>
  );
}
