import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResourcePin } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';
import { DownloadStopped, installPin, missingPins } from '../resources/installPins';

type Row = { pin: ResourcePin; state: 'waiting' | 'downloading' | 'installed' | 'stopped' | 'failed'; message?: string };

const labelOf = (pin: ResourcePin) => `${pin.repoPath.split('/').pop()} ${pin.version ?? pin.sha.slice(0, 7)}`;

/** Installs the project's missing pinned resources, then calls onReady. Nothing to install: onReady at once. */
export default function ResourceInstall({ repoPath, source, onReady, onBack }: { repoPath: string; source: ProjectSource; onReady: () => void; onBack: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One install pass per mount: React's development double effect must not start two downloads of one pin.
  const started = useRef(false);
  // A download keeps going after the checker leaves this screen; what it finds then must not move them.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (pins: ResourcePin[]) => {
      const next: Row[] = pins.map((pin) => ({ pin, state: 'waiting' }));
      const show = () => mounted.current && setRows([...next]);
      show();
      for (const row of next) {
        row.state = 'downloading';
        show();
        try {
          await installPin(row.pin, source);
          row.state = 'installed';
        } catch (e) {
          row.state = e instanceof DownloadStopped ? 'stopped' : 'failed';
          row.message = (e as Error).message;
        }
        show();
      }
      if (mounted.current && next.every((r) => r.state === 'installed')) onReady();
    },
    [source, onReady],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const resources = await source.readResources(repoPath);
      if (!mounted.current) return;
      if (!resources) return onBack();
      const pins = await missingPins(resources, source);
      if (!mounted.current) return;
      if (pins.length === 0) return onReady();
      await source.enableNet();
      await run(pins);
    })().catch((e: Error) => mounted.current && setError(e.message));
  }, [repoPath, source, onReady, onBack, run]);

  const retry = () => rows && run(rows.filter((r) => r.state !== 'installed').map((r) => r.pin));
  const stopped = rows?.some((r) => r.state === 'stopped' || r.state === 'failed');

  return (
    <main className="screen">
      <h1>Getting resources</h1>
      <p className="muted">This project checks against these resources. They download once, then work offline.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {rows?.map((r) => (
        <div className="row" key={`${r.pin.repoPath}@${r.pin.sha}`}>
          <span>{labelOf(r.pin)}</span>
          <span className="muted">
            {r.state === 'waiting' && 'Waiting'}
            {r.state === 'downloading' && 'Downloading…'}
            {r.state === 'installed' && 'Installed'}
            {r.state === 'stopped' && 'Download stopped'}
            {r.state === 'failed' && 'Not installed'}
          </span>
        </div>
      ))}
      {rows?.filter((r) => r.state === 'failed').map((r) => (
        <p className="muted" key={`m-${r.pin.repoPath}`}>
          {r.message}
        </p>
      ))}
      {stopped && (
        <>
          <p>This resource isn't on this device yet. Connect to the internet and try again, or continue: checks and panes that need it say so.</p>
          <button className="primary" onClick={retry}>
            Try again
          </button>
          <button onClick={onReady}>Continue</button>
        </>
      )}
      <button onClick={onBack}>Back</button>
    </main>
  );
}
