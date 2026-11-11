import { useState } from 'react';
import type { ProjectSource } from '../project/ProjectSource';
import { syncProject } from '../session/syncProject';
import { syncFailureText } from './syncFailure';
import { IDLE, type Run } from './load';
import { t } from '../i18n';

/** Syncs the project, and says why it did not sync in the checker's words, or null when it did (#59). */
export const syncOrWhy = async (repoPath: string, door43: { username: string; token: string }, source: ProjectSource): Promise<string | null> => {
  try {
    const failure = await syncProject(repoPath, door43, source);
    return failure && syncFailureText(failure);
  } catch (e) {
    return (e as Error).message;
  }
};

/** A screen's Sync of its project: running, or why it failed; `onSynced` reads the screen again after one that worked. */
export const useSync = (repoPath: string, door43: { username: string; token: string }, source: ProjectSource, onSynced: () => void) => {
  const [run, setRun] = useState<Run<{ state: 'syncing' }>>(IDLE);
  const sync = async () => {
    setRun({ state: 'syncing' });
    const why = await syncOrWhy(repoPath, door43, source);
    setRun(why ? { state: 'failed', message: why } : IDLE);
    if (!why) onSynced();
  };
  return { run, sync };
};

type Props = {
  /** True while the screen's Sync runs: the button says so and waits. */
  syncing: boolean;
  /** True while something else on the screen runs that Sync must wait for (another row's Sync, an opening). */
  disabled?: boolean;
  onSync: () => void;
  /** The project's name, on a row of the projects screen: a screen reader hears which project it syncs. */
  project?: string;
};

/** Sync, on every screen of a project and on each project's row (#59). The screen holds the run. */
export default function SyncButton({ syncing, disabled, onSync, project }: Props) {
  return (
    <button className={project ? 'row-sync' : undefined} onClick={onSync} disabled={syncing || disabled} aria-label={project && t(syncing ? 'syncingProject' : 'syncProject', { name: project })}>
      {syncing ? t('syncing') : t('sync')}
    </button>
  );
}
