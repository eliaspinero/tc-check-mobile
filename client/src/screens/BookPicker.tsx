import { useEffect, useState } from 'react';
import type { Tool } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';
import { scopeOf } from '../session/loadSession';

const TOOLS: Tool[] = ['translationWords', 'translationNotes'];

export default function BookPicker({ repoPath, source, onPick, onBack }: { repoPath: string; source: ProjectSource; onPick: (book: string, tool: Tool) => void; onBack: () => void }) {
  const [books, setBooks] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    source.readMetadata(repoPath).then(
      (meta) => setBooks(Object.keys(scopeOf(meta))),
      (e: Error) => setError(e.message),
    );
  }, [repoPath, source]);

  return (
    <main className="screen">
      <h1>Choose a book</h1>
      <p className="muted">{repoPath.split('/').slice(-2).join('/')}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {books?.map((book) => (
        <div key={book} className="row">
          <strong>{book}</strong>
          <span style={{ display: 'flex', gap: 8 }}>
            {TOOLS.map((tool) => (
              <button key={tool} aria-label={`${book} ${tool}`} onClick={() => onPick(book, tool)}>
                {tool === 'translationWords' ? 'tW' : 'tN'}
              </button>
            ))}
          </span>
        </div>
      ))}
      <button onClick={onBack}>Back</button>
    </main>
  );
}
