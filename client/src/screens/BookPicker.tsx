import { useCallback, useEffect, useState } from 'react';
import type { CheckingEngine, Tool } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';
import { scopeOf, type Session } from '../session/loadSession';
import { keep, kept, keptFailed, keys, sessionOf } from '../session/kept';
import { t } from '../i18n';
import { bookName, toolName } from '../i18n/books';
import TopBar from './TopBar';
import ErrorLine from './ErrorLine';
import Skeleton from './Skeleton';
import SyncButton, { useSync } from './SyncButton';
import { stagger } from './stagger';
import { LOADING, failure, ready, type Load } from './load';

/** A session's progress, or null when its list cannot be shown (the list says why). */
const progressOf = (s: Session) => (s.state === 'ready' ? s.progress : null);

const TOOLS: Tool[] = ['translationWords', 'translationNotes'];

type Props = {
  repoPath: string;
  source: ProjectSource;
  engine: CheckingEngine;
  onPick: (book: string, tool: Tool) => void;
  onBack: () => void;
  /** The checker signed in: Sync runs as them. */
  door43: { username: string; token: string };
};

export default function BookPicker({ repoPath, source, engine, onPick, onBack, door43 }: Props) {
  // What this run has read already shows at once (session/kept.ts); the rest is read in the background.
  const [scope, setScope] = useState<Load<string[]>>(() => {
    const known = kept<string[]>(keys.scope(repoPath));
    return known ? { state: 'ready', value: known } : LOADING;
  });
  const books = ready(scope);

  // `${book} ${tool}` → its progress, or null when the list cannot be shown (the list says why).
  const [progress, setProgress] = useState<Record<string, { decided: number; total: number } | null>>(() => {
    const known: Record<string, { decided: number; total: number } | null> = {};
    for (const book of kept<string[]>(keys.scope(repoPath)) ?? [])
      for (const tool of TOOLS) {
        const key = keys.session(repoPath, tool, book);
        const s = kept<Session>(key);
        if (s) known[`${book} ${tool}`] = progressOf(s);
        else if (keptFailed(key)) known[`${book} ${tool}`] = null;
      }
    return known;
  });

  const loadScope = useCallback(() => {
    keep(keys.scope(repoPath), () => source.readMetadata(repoPath).then((meta) => Object.keys(scopeOf(meta)))).then(
      (value) => setScope({ state: 'ready', value }),
      (e: Error) => setScope({ state: 'failed', message: e.message }),
    );
  }, [repoPath, source]);
  useEffect(loadScope, [loadScope]);
  // A Sync that worked reads the books again.
  const { run: syncRun, sync } = useSync(repoPath, door43, source, loadScope);

  // One book and tool at a time, in the background: a tap never waits for it, and a list it opens shares the read.
  useEffect(() => {
    if (!books) return;
    let current = true;
    (async () => {
      for (const book of books)
        for (const tool of TOOLS) {
          const counts = await sessionOf(repoPath, tool, book, source, engine).then(progressOf, () => null);
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
      <TopBar
        brand
        title={t('booksTitle')}
        sub={repoPath.split('/').slice(-2).join('/')}
        onBack={onBack}
        actions={<SyncButton syncing={syncRun.state === 'syncing'} onSync={sync} />}
      />
      <ErrorLine text={failure(syncRun) ?? failure(scope)} />
      {scope.state === 'loading' && <Skeleton shape="books" label={t('loadingBooks')} />}
      {books?.map((book, i) => (
        <div key={book} className="book enter" style={stagger(i)}>
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
