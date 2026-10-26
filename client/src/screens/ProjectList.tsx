import { useEffect, useState } from 'react';
import type { Door43Api, Door43Repo, Door43Session } from '../door43/door43Api';
import type { ProjectSource } from '../project/ProjectSource';

type Props = {
  api: Door43Api;
  source: ProjectSource;
  session: Door43Session;
  /** The Door43 host projects are cloned from, for example `qa.door43.org`. */
  host: string;
  onOpen: (repoPath: string) => void;
};

/** The local repo path of a Door43 repo, if this device holds it (paths compare case-insensitively, as DCS does). */
const localPathOf = (local: string[], host: string, repo: Door43Repo): string | null => {
  const want = `${host}/${repo.owner}/${repo.name}`.toLowerCase();
  return local.find((p) => p.toLowerCase() === want) ?? null;
};

export default function ProjectList({ api, source, session, host, onOpen }: Props) {
  const [repos, setRepos] = useState<Door43Repo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notTc, setNotTc] = useState(false);

  // When Door43 can't be reached, the projects already on this device are still listed and open offline.
  useEffect(() => {
    api.listRepos(session).then(setRepos, async (e: Error) => {
      setError(`${e.message}. Showing the projects on this device.`);
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
        await source.enableNet();
        repoPath = await source.clone(host, repo.owner, repo.name);
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
        <h1>Not a project</h1>
        <p>This isn't a translationCore project. It has no checking resources, so there is nothing to check.</p>
        <button onClick={() => setNotTc(false)}>Back</button>
      </main>
    );

  return (
    <main className="screen">
      <h1>Your projects</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {repos === null && !error && <p className="muted">Loading your projects…</p>}
      {repos?.length === 0 && <p className="muted">Your Door43 account and organizations have no repositories yet.</p>}
      {repos?.map((r) => (
        <button key={`${r.owner}/${r.name}`} className="row" disabled={busy !== null} onClick={() => open(r)}>
          <span>
            {r.name}
            <br />
            <span className="muted">
              {r.owner}
              {r.description ? ` · ${r.description}` : ''}
            </span>
          </span>
          <span className="muted">{busy === `${r.owner}/${r.name}` ? 'Opening…' : ''}</span>
        </button>
      ))}
    </main>
  );
}
