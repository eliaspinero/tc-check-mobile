import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { openExternal } from '../device/tauri';
import type { CheckingEngine, Tool } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';
import { scopeOf, type Session } from '../session/loadSession';
import { keep, kept, keptFailed, keptProgress, keys, sessionOf } from '../session/kept';
import { t } from '../i18n';
import { bookName, toolName } from '../i18n/books';
import TopBar from './TopBar';
import Sheet from './Sheet';
import ErrorLine from './ErrorLine';
import Skeleton from './Skeleton';
import { stagger } from './stagger';
import { LOADING, failure, ready, type Load } from './load';

/** A session's progress, or null when its list cannot be shown (the list says why). */
const progressOf = (s: Session) => (s.state === 'ready' ? s.progress : null);

const TOOLS: Tool[] = ['translationWords', 'translationNotes'];

type Props = { repoPath: string; source: ProjectSource; engine: CheckingEngine; onPick: (book: string, tool: Tool) => void; onBack: () => void };

export default function BookPicker({ repoPath, source, engine, onPick, onBack }: Props) {
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

  useEffect(() => {
    keep(keys.scope(repoPath), () => source.readMetadata(repoPath).then((meta) => Object.keys(scopeOf(meta)))).then(
      (value) => setScope({ state: 'ready', value }),
      (e: Error) => setScope({ state: 'failed', message: e.message }),
    );
  }, [repoPath, source]);

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

  // Every project here was opened from Door43, so its repo path is `<host>/<owner>/<repo>`.
  const door43Url = `https://${repoPath}`;
  // Opening Door43 leaves the app, so a sheet asks first.
  const [leaving, setLeaving] = useState(false);
  const closeLeaving = useCallback(() => setLeaving(false), []);
  // In the app, the phone's browser opens the page, not the app's own window; in a plain browser the link opens it.
  const openOnDoor43 = (e: MouseEvent) => {
    if (openExternal(door43Url)) e.preventDefault();
    setLeaving(false);
  };

  return (
    <main className="screen">
      <TopBar
        brand
        title={t('booksTitle')}
        sub={repoPath.split('/').slice(-2).join('/')}
        onBack={onBack}
        actions={
          // An icon, so a long project name keeps the bar's width (#61 review).
          <button className="icon" aria-label={t('openOnDoor43')} aria-haspopup="dialog" onClick={() => setLeaving(true)}>
            ↗
          </button>
        }
      />
      <Sheet open={leaving} onClose={closeLeaving} labelledBy="leaving-title">
        <div className="sheet-head">
          <h2 id="leaving-title">{t('leavingTitle')}</h2>
        </div>
        <p>{t('leavingBody', { place: repoPath })}</p>
        <div className="sheet-actions">
          <button onClick={closeLeaving}>{t('cancel')}</button>
          <a className="link-button primary" href={door43Url} target="_blank" rel="noreferrer" onClick={openOnDoor43}>
            {t('open')}
          </a>
        </div>
      </Sheet>
      <ErrorLine text={failure(scope)} />
      {scope.state === 'loading' && <Skeleton shape="books" label={t('loadingBooks')} />}
      {books?.map((book, i) => (
        <div key={book} className="book enter" style={stagger(i)}>
          <span className="book-name">{bookName(book)}</span>
          <span className="book-tools">
            {TOOLS.map((tool) => {
              const key = `${book} ${tool}`;
              // Until this run counts it, the progress counted last, also before the app restarted.
              const counts = progress[key] !== undefined ? progress[key] : keptProgress(repoPath, book, tool);
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
