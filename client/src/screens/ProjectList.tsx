import { useEffect, useRef, useState } from 'react';
import type { Door43Api, Door43Repo, Door43Session } from '../door43/door43Api';
import type { ProjectSource } from '../project/ProjectSource';
import { t } from '../i18n';
import TopBar from './TopBar';
import { door43ErrorText } from './door43Error';

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notTc, setNotTc] = useState(false);

  // When Door43 can't be reached, the projects already on this device are still listed and open offline.
  useEffect(() => {
    api.listRepos(session).then(setRepos, async (e: unknown) => {
      setError(t('offlineProjects', { error: door43ErrorText(e) }));
      const prefix = `${host}/`.toLowerCase();
      const local = (await source.listLocal()).filter((p) => p.toLowerCase().startsWith(prefix));
      setRepos(
        local.map((p) => {
          const [owner, name] = p.slice(prefix.length).split('/');
          return { owner, name, description: '' };
        }),
      );
    });
  }, [api, session, source, host]);

  const open = async (repo: Door43Repo) => {
    setBusy(`${repo.owner}/${repo.name}`);
    setError(null);
    try {
      let repoPath = localPathOf(await source.listLocal(), host, repo);
      if (!repoPath) {
        onCloning(`${repo.owner}/${repo.name}`, true);
        try {
          await source.enableNet();
          repoPath = await source.clone(host, repo.owner, repo.name);
        } finally {
          onCloning(`${repo.owner}/${repo.name}`, false);
        }
      }
      if (!(await source.readResources(repoPath))) {
        setNotTc(true);
        return;
      }
      onOpen(repoPath);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (notTc)
    return (
      <main className="screen">
        <TopBar title={t('notProjectTitle')} onBack={() => setNotTc(false)} />
        <p>{t('notProjectBody')}</p>
      </main>
    );

  return (
    <main className="screen">
      <TopBar title={t('projectsTitle')} sub={session.username || undefined} actions={<SignOut onSignOut={onSignOut} />} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {repos === null && !error && <p className="muted">{t('loadingProjects')}</p>}
      {repos?.length === 0 && <p className="muted">{t('noRepos')}</p>}
      {repos?.map((r) => (
        <button key={`${r.owner}/${r.name}`} className="row project" disabled={busy !== null || cloning.has(`${r.owner}/${r.name}`)} onClick={() => open(r)}>
          <span className="project-text">
            <span className="project-name">{r.name}</span>
            <span className="muted">
              {r.owner}
              {r.description ? ` · ${r.description}` : ''}
            </span>
          </span>
          <span className="muted">{busy === `${r.owner}/${r.name}` || cloning.has(`${r.owner}/${r.name}`) ? t('opening') : '›'}</span>
        </button>
      ))}
    </main>
  );
}
