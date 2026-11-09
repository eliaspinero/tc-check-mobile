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

type Props = {
  api: Door43Api;
  source: ProjectSource;
  session: Door43Session;
  /** The Door43 host projects are cloned from, for example `qa.door43.org`. */
  host: string;
  onOpen: (repoPath: string) => void;
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

/** Whether each repository is in the Rust tC4's format, asked of Door43 once per run (#56). */
const tcFormats = new Map<string, Promise<boolean>>();
/** How many repositories are asked about at once. */
const AT_ONCE = 6;

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
  const [repos, setRepos] = useState<Door43Repo[] | null>(null);
  // What the screen is doing besides listing: nothing, opening one project (`owner/name`), showing why the
  // list or an opening failed (over the list, which stays), or saying the opened repo is not a tC project.
  const [status, setStatus] = useState<Run<{ state: 'opening'; key: string } | { state: 'notTc' } | { state: 'tc4x' }>>(IDLE);
  // Which listed projects the checker can check here (#56): in the Rust tC4's format and theirs to change. A
  // project not known yet is in neither part; one that is not is under "Other projects", closed at first.
  const [usable, setUsable] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [showOthers, setShowOthers] = useState(false);

  // When Door43 can't be reached, the projects already on this device are still listed and open offline.
  useEffect(() => {
    let current = true;
    // Door43 is asked about each repository the checker may change, a few at a time; the rest need no question.
    // A question that fails leaves the project shown: nothing is hidden for want of an answer.
    const sort = (list: Door43Repo[]) => {
      setUsable(new Map(list.filter((r) => r.canPush === false).map((r) => [keyOf(r), false])));
      const asked = list.filter((r) => r.canPush !== false);
      let next = 0;
      const worker = async () => {
        while (current && next < asked.length) {
          const repo = asked[next++];
          const key = `${host}/${keyOf(repo)}`;
          if (!tcFormats.has(key)) tcFormats.set(key, api.isTcProject(session, repo).catch(() => true));
          const isTc = await tcFormats.get(key)!;
          if (current) setUsable((old) => new Map(old).set(keyOf(repo), isTc));
        }
      };
      void Promise.all(Array.from({ length: AT_ONCE }, worker));
    };
    api.listRepos(session).then(
      (list) => {
        setRepos(list);
        sort(list);
      },
      async (e: unknown) => {
        setStatus({ state: 'failed', message: t('offlineProjects', { error: door43ErrorText(e) }) });
        const prefix = `${host}/`.toLowerCase();
        const local = (await source.listLocal()).filter((p) => p.toLowerCase().startsWith(prefix));
        const list = local.map((p) => {
          const [owner, name] = p.slice(prefix.length).split('/');
          return { owner, name, description: '', canPush: null };
        });
        // Offline, the projects on this device show as they did: all of them, unasked.
        setRepos(list);
        setUsable(new Map(list.map((r) => [keyOf(r), true])));
      },
    );
    return () => {
      current = false;
    };
  }, [api, session, source, host]);

  // Opening clears the offline notice, as any earlier failure: what shows next is about this project.
  const open = async (repo: Door43Repo) => {
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
      if (!(await source.readResources(repoPath))) {
        setStatus({ state: 'notTc' });
        return;
      }
      if (isTc4xProject(await source.listPaths(repoPath))) {
        setStatus({ state: 'tc4x' });
        return;
      }
      onOpen(repoPath);
      setStatus(IDLE);
    } catch (e) {
      setStatus({ state: 'failed', message: (e as Error).message });
    }
  };
  const opening = status.state === 'opening' ? status.key : null;
  // The list in two parts (#56): the projects the checker can check here first, the others behind a control.
  const ready = repos?.filter((r) => usable.get(keyOf(r)) === true) ?? [];
  const others = repos?.filter((r) => usable.get(keyOf(r)) === false) ?? [];
  const total = repos?.length ?? 0;
  const finding = total - ready.length - others.length;

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
      {ready.map((r, i) => (
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
      {finding > 0 && <p className="muted" data-testid="finding-projects">{t('findingProjects', { done: total - finding, total })}</p>}
      {finding === 0 && ready.length === 0 && others.length > 0 && <p className="muted">{t('noUsableProjects')}</p>}
      {others.length > 0 && (
        <button className="link" aria-expanded={showOthers} onClick={() => setShowOthers(!showOthers)}>
          {t('otherProjects', { count: others.length })}
        </button>
      )}
      {showOthers &&
        others.map((r, i) => (
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
