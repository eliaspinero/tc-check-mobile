import { useEffect, useState } from 'react';
import type { CheckingEngine, Tool } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';
import { loadSession, scopeOf } from '../session/loadSession';
import { t } from '../i18n';
import { bookName, toolName } from '../i18n/books';
import TopBar from './TopBar';

const TOOLS: Tool[] = ['translationWords', 'translationNotes'];

type Props = { repoPath: string; source: ProjectSource; engine: CheckingEngine; onPick: (book: string, tool: Tool) => void; onBack: () => void };

export default function BookPicker({ repoPath, source, engine, onPick, onBack }: Props) {
  const [books, setBooks] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // `${book} ${tool}` → its progress, or null when the list cannot be shown (the list says why).
  const [progress, setProgress] = useState<Record<string, { decided: number; total: number } | null>>({});

  useEffect(() => {
    source.readMetadata(repoPath).then(
      (meta) => setBooks(Object.keys(scopeOf(meta))),
      (e: Error) => setError(e.message),
    );
  }, [repoPath, source]);

  // One book and tool at a time, in the background: a tap never waits for it.
  useEffect(() => {
    if (!books) return;
    let current = true;
    (async () => {
      for (const book of books)
        for (const tool of TOOLS) {
          const counts = await loadSession(repoPath, tool, book, source, engine).then(
            (s) => (s.state === 'ready' ? s.progress : null),
            () => null,
          );
          if (!current) return;
          setProgress((p) => ({ ...p, [`${book} ${tool}`]: counts }));
        }
    })();
    return () => {
      current = false;
    };
  }, [books, repoPath, source, engine]);

  return (
    <main className="screen">
      <TopBar title={t('booksTitle')} sub={repoPath.split('/').slice(-2).join('/')} onBack={onBack} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {books?.map((book) => (
        <div key={book} className="book">
          <span className="book-name">{bookName(book)}</span>
          <span className="book-tools">
            {TOOLS.map((tool) => {
              const key = `${book} ${tool}`;
              const counts = progress[key];
              const name = `${bookName(book)} ${toolName(tool)}`;
              // The label replaces the button's content for a screen reader, so it says the progress too.
              const label =
                counts === undefined ? t('bookToolLoading', { name }) : counts === null ? name : t('bookToolProgress', { name, ...counts });
              return (
                <button key={tool} className="tool" aria-label={label} onClick={() => onPick(book, tool)}>
                  <span>{toolName(tool)}</span>
                  <span className="muted" data-testid="book-progress">
                    {counts === undefined ? '…' : counts === null ? '–' : `${counts.decided} / ${counts.total}`}
                  </span>
                </button>
              );
            })}
          </span>
        </div>
      ))}
    </main>
  );
}
