import { useEffect, useRef, useState } from 'react';
import type { Door43Api, Door43Repo, Door43Session } from '../door43/door43Api';
import type { ProjectSource } from '../project/ProjectSource';
import { t } from '../i18n';
import TopBar from './TopBar';
import ErrorLine from './ErrorLine';
import Skeleton from './Skeleton';
import { stagger } from './stagger';
import { IDLE, failure, type Run } from './load';
import { door43ErrorText } from './door43Error';
import { isTc4xProject } from '../session/decide';
import { keepNow, keys, kept } from '../session/kept';
import { missingPins } from '../resources/installPins';

type Props = {
  api: Door43Api;
  source: ProjectSource;
  session: Door43Session;
  /** The Door43 host projects are cloned from, for example `qa.door43.org`. */
  host: string;
  /** `installed`: every resource the project pins is on this device, so it opens on its books. */
  onOpen: (repoPath: string, installed: boolean) => void;
  onSignOut: () => void;
  /** Projects (`owner/name`) whose clone is still running, also from before a sign-out. */
  cloning: ReadonlySet<string>;
  onCloning: (key: string, running: boolean) => void;
};

/** The local repo path of a Door43 repo, if this device holds it (paths compare case-insensitively, as DCS does). */
const localPathOf = (local: string[], host: string, repo: Door43Repo): string | null => {
  const want = `${host}/${repo.owner}/${repo.name}`.toLowerCase();
  return local.find((p) => p.toLowerCase() === want) ?? null;
};

/** A project's key in the opening and cloning states: `owner/name`. */
const keyOf = (repo: Door43Repo): string => `${repo.owner}/${repo.name}`;

/** Sign out takes a second tap within 4 s: signed out with no internet, the checker cannot sign in again until online. */
function SignOut({ onSignOut }: { onSignOut: () => void }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const tap = () => {
    if (armed) return onSignOut();
    setArmed(true);
    timer.current = window.setTimeout(() => setArmed(false), 4000);
  };
  return (
    <button className={armed ? 'danger' : ''} onClick={tap}>
      {armed ? t('signOutConfirm') : t('signOut')}
    </button>
  );
}

export default function ProjectList({ api, source, session, host, onOpen, onSignOut, cloning, onCloning }: Props) {
  // The Door43 list this run read last for this checker shows at once (session/kept.ts); Door43's answer replaces it.
  const listKey = keys.projects(host, session.username);
  const [repos, setRepos] = useState<Door43Repo[] | null>(() => kept<Door43Repo[]>(listKey) ?? null);
  // What the screen is doing besides listing: nothing, opening one project (`owner/name`), showing why the
  // list or an opening failed (over the list, which stays), or saying the opened repo is not a tC project.
  const [status, setStatus] = useState<Run<{ state: 'opening'; key: string } | { state: 'notTc' } | { state: 'tc4x' }>>(IDLE);

  // When Door43 can't be reached, the projects already on this device are still listed and open offline.
  useEffect(() => {
    const list = (got: Door43Repo[]) => {
      keepNow(listKey, got);
      setRepos(got);
    };
    api.listRepos(session).then(list, async (e: unknown) => {
      setStatus({ state: 'failed', message: t('offlineProjects', { error: door43ErrorText(e) }) });
      // A list kept from earlier in this run stays.
      if (kept(listKey)) return;
      const prefix = `${host}/`.toLowerCase();
      const local = (await source.listLocal()).filter((p) => p.toLowerCase().startsWith(prefix));
      setRepos(
        local.map((p) => {
          const [owner, name] = p.slice(prefix.length).split('/');
          return { owner, name, description: '' };
        }),
      );
    });
  }, [api, session, source, host, listKey]);

  // Opening clears the offline notice, as any earlier failure: what shows next is about this project.
  const open = async (repo: Door43Repo) => {
    // A project opened earlier in this run with every resource on the device opens again without reading anything.
    const known = kept<string>(keys.ready(`${host}/${repo.owner}/${repo.name}`));
    if (known) return onOpen(known, true);
    setStatus({ state: 'opening', key: keyOf(repo) });
    try {
      let repoPath = localPathOf(await source.listLocal(), host, repo);
      if (!repoPath) {
        onCloning(keyOf(repo), true);
        try {
          await source.enableNet();
          repoPath = await source.clone(host, repo.owner, repo.name);
        } finally {
          onCloning(keyOf(repo), false);
        }
      }
      const resources = await source.readResources(repoPath);
      if (!resources) {
        setStatus({ state: 'notTc' });
        return;
      }
      if (isTc4xProject(await source.listPaths(repoPath))) {
        setStatus({ state: 'tc4x' });
        return;
      }
      // Straight to the books when nothing is missing: the resources screen shows only to install.
      const installed = (await missingPins(resources, source)).length === 0;
      if (installed) keepNow(keys.ready(`${host}/${repo.owner}/${repo.name}`), repoPath);
      onOpen(repoPath, installed);
      setStatus(IDLE);
    } catch (e) {
      setStatus({ state: 'failed', message: (e as Error).message });
    }
  };
  const opening = status.state === 'opening' ? status.key : null;

  if (status.state === 'tc4x')
    return (
      <main className="screen">
        <TopBar title={t('tc4xTitle')} onBack={() => setStatus(IDLE)} />
        <p>{t('tc4xBody')}</p>
      </main>
    );

  if (status.state === 'notTc')
    return (
      <main className="screen">
        <TopBar title={t('notProjectTitle')} onBack={() => setStatus(IDLE)} />
        <p>{t('notProjectBody')}</p>
      </main>
    );

  return (
    <main className="screen">
      <TopBar brand title={t('projectsTitle')} sub={session.username || undefined} actions={<SignOut onSignOut={onSignOut} />} />
      <ErrorLine text={failure(status)} />
      {repos === null && status.state !== 'failed' && <Skeleton shape="projects" label={t('loadingProjects')} />}
      {repos?.length === 0 && <p className="muted">{t('noRepos')}</p>}
      {repos?.map((r, i) => (
        <button key={keyOf(r)} className="row project enter" style={stagger(i)} disabled={opening !== null || cloning.has(keyOf(r))} onClick={() => open(r)}>
          <span className="project-text">
            <span className="project-name">{r.name}</span>
            <span className="muted">
              {r.owner}
              {r.description ? ` · ${r.description}` : ''}
            </span>
          </span>
          <span className="muted">{opening === keyOf(r) || cloning.has(keyOf(r)) ? t('opening') : '›'}</span>
        </button>
      ))}
    </main>
  );
}
