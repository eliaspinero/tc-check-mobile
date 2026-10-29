import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResourcePin } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';
import { DownloadStopped, installPin, missingPins } from '../resources/installPins';
import { t } from '../i18n';
import { resourceErrorText } from './resourceError';
import TopBar from './TopBar';
import ErrorLine from './ErrorLine';
import Skeleton from './Skeleton';
import { LOADING, failure, ready, type Load } from './load';

type Row = { pin: ResourcePin; state: 'waiting' | 'downloading' | 'installed' | 'stopped' | 'failed'; reason?: string; message?: string };

const labelOf = (pin: ResourcePin) => `${pin.repoPath.split('/').pop()} ${pin.version ?? pin.sha.slice(0, 7)}`;

/** Installs the project's missing pinned resources, then calls onReady. Nothing to install: onReady at once. */
export default function ResourceInstall({ repoPath, source, onReady, onBack }: { repoPath: string; source: ProjectSource; onReady: () => void; onBack: () => void }) {
  // Ready holds the rows, and each row keeps its own state.
  const [install, setInstall] = useState<Load<Row[]>>(LOADING);
  const rows = ready(install);
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
      const show = () => mounted.current && setInstall({ state: 'ready', value: [...next] });
      show();
      for (const row of next) {
        row.state = 'downloading';
        show();
        try {
          await installPin(row.pin, source);
          row.state = 'installed';
        } catch (e) {
          row.state = e instanceof DownloadStopped ? 'stopped' : 'failed';
          row.reason = resourceErrorText(e);
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
    })().catch((e: Error) => mounted.current && setInstall({ state: 'failed', message: e.message }));
  }, [repoPath, source, onReady, onBack, run]);

  const retry = () => rows && run(rows.filter((r) => r.state !== 'installed').map((r) => r.pin));
  const stopped = rows?.some((r) => r.state === 'stopped' || r.state === 'failed');
  // Connecting helps only a stopped download; a failure Door43 answered needs no internet advice.
  const offline = rows?.some((r) => r.state === 'stopped');

  return (
    <main className="screen">
      <TopBar title={t('resourcesTitle')} onBack={onBack} />
      <p className="muted">{t('resourcesIntro')}</p>
      <ErrorLine text={failure(install)} />
      {install.state === 'loading' && <Skeleton shape="resources" label={t('loadingResources')} />}
      {rows?.map((r) => (
        <div className="row" key={`${r.pin.repoPath}@${r.pin.sha}`}>
          <span>{labelOf(r.pin)}</span>
          <span className="muted">
            {r.state === 'waiting' && t('waiting')}
            {r.state === 'downloading' && t('downloading')}
            {r.state === 'installed' && t('installed')}
            {r.state === 'stopped' && t('downloadStopped')}
            {r.state === 'failed' && t('notInstalled')}
          </span>
        </div>
      ))}
      {/* Why each resource did not install, in the checker's language; a failure keeps its raw detail below for
          support. A stopped download's detail is only its URL, so it shows the reason alone. */}
      {rows?.filter((r) => r.state === 'stopped' || r.state === 'failed').map((r) => (
        <div key={`m-${r.pin.repoPath}`}>
          <p>{`${labelOf(r.pin)}: ${r.reason}`}</p>
          {r.state === 'failed' && <p className="muted">{r.message}</p>}
        </div>
      ))}
      {stopped && (
        <>
          <p>{t(offline ? 'resourceMissing' : 'resourceNotInstalled')}</p>
          <button className="primary" onClick={retry}>
            {t('tryAgain')}
          </button>
          <button onClick={onReady}>{t('continue')}</button>
        </>
      )}
    </main>
  );
}
