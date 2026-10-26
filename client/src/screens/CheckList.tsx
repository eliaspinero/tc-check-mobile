import { useCallback, useEffect, useState } from 'react';
import type { CheckingEngine, CheckItem, Tool } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';
import { loadSession, type Session } from '../session/loadSession';

const STATE_TEXT: Record<Exclude<Session['state'], 'ready'>, string> = {
  unavailable: "The pinned version isn't on this device yet. Go back to the project to download it; nothing else stops.",
  unpinned: 'This project has no resources pinned for this tool yet.',
  'not-covered': 'Neither language set of this project covers this book for this tool.',
  'old-twl': 'This project pins the old one-repo translationWords form, which is no longer read. Create the project again in translationCore.',
};

const refOf = (item: CheckItem): string => {
  const r = item.contextId.reference as { chapter?: unknown; verse?: unknown };
  return `${String(r.chapter)}:${String(r.verse)}`;
};

type Props = {
  repoPath: string;
  tool: Tool;
  book: string;
  source: ProjectSource;
  engine: CheckingEngine;
  onOpen: (session: Session, index: number) => void;
  onBack: () => void;
};

export default function CheckList({ repoPath, tool, book, source, engine, onOpen, onBack }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    loadSession(repoPath, tool, book, source, engine).then(setSession, (e: Error) => setError(e.message));
  }, [repoPath, tool, book, source, engine]);
  useEffect(load, [load]);

  return (
    <main className="screen">
      <h1>
        {book} · {tool}
      </h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {session && session.state !== 'ready' && <p>{STATE_TEXT[session.state]}</p>}
      {session?.state === 'ready' && (
        <>
          <p data-testid="progress">
            {session.progress.decided} of {session.progress.total} checked
          </p>
          {session.dropped && (
            <p className="muted" data-testid="dropped">
              {session.dropped.count} checks can't be placed in this project's numbering ({session.dropped.scheme}) and are not counted.
            </p>
          )}
          {session.items.map((item, i) => (
            <button key={`${item.contextId.checkId}-${i}`} className="row" data-testid="check-row" onClick={() => onOpen(session, i)}>
              <span>
                {refOf(item)} · {item.contextId.groupId}
              </span>
              <span className="muted">{item.selections !== false ? 'Checked' : ''}</span>
            </button>
          ))}
        </>
      )}
      <button onClick={onBack}>Back</button>
    </main>
  );
}
