// ProjectSource over pankosmia-web (routes as tC4's serverApi.ts uses them, all under /api).
import { ServerError, type ProjectSource } from './ProjectSource';
import type { DecisionFile, ResourcesFile } from '../checking/types';

const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');

const reasonOf = (text: string): string => {
  try {
    const parsed = JSON.parse(text) as { reason?: unknown };
    if (typeof parsed.reason === 'string') return parsed.reason;
  } catch {
    // not JSON
  }
  return text.slice(0, 300);
};

export const pankosmiaSource = (base = '/api', fetchFn: typeof fetch = fetch): ProjectSource => {
  const text = async (route: string, init?: RequestInit): Promise<string> => {
    const res = await fetchFn(`${base}${route}`, init);
    const body = await res.text();
    if (!res.ok) throw new ServerError(route, res.status, reasonOf(body));
    return body;
  };
  const post = async (route: string, init: RequestInit = {}): Promise<void> => {
    const body = await text(route, { ...init, method: 'POST' });
    let ok = false;
    try {
      ok = (JSON.parse(body) as { is_good?: boolean }).is_good === true;
    } catch {
      // unparseable: refused below
    }
    if (!ok) throw new ServerError(route, 200, reasonOf(body));
  };
  const readJsonOrNull = async <T>(repoPath: string, ipath: string): Promise<T | null> => {
    try {
      return JSON.parse(await text(`/burrito/ingredient/raw/${enc(repoPath)}?ipath=${enc(ipath)}`)) as T;
    } catch (e) {
      if (e instanceof ServerError && (e.status === 404 || e.status === 400)) return null;
      throw e;
    }
  };

  return {
    enableNet: () => post('/net/enable'),
    listLocal: async () => JSON.parse(await text('/git/list-local-repos')) as string[],
    clone: async (host, org, repo) => {
      const repoPath = `${host}/${org}/${repo}`;
      await post(`/git/clone-repo/${enc(repoPath)}`);
      return repoPath;
    },
    pull: (repoPath) => post(`/git/pull-repo/origin/${enc(repoPath)}`),
    readText: (repoPath, ipath) => text(`/burrito/ingredient/raw/${enc(repoPath)}?ipath=${enc(ipath)}`),
    readMetadata: async (repoPath) => JSON.parse(await text(`/burrito/metadata/raw/${enc(repoPath)}`)) as Record<string, unknown>,
    readResources: (repoPath) => readJsonOrNull<ResourcesFile>(repoPath, 'checking/resources.json'),
    readDecisions: (repoPath, tool, book) => readJsonOrNull<DecisionFile>(repoPath, `checking/${tool}/${book}.json`),
    installResourceZip: async (localRepoPath, zip) => {
      if (!localRepoPath.startsWith('_local_/_sideloaded_/')) {
        throw new ServerError(`/burrito/zipped/${localRepoPath}`, 0, 'a resource installs under _local_/_sideloaded_/ only');
      }
      const copy = new Uint8Array(zip.length);
      copy.set(zip);
      const form = new FormData();
      form.append('file', new Blob([copy], { type: 'application/zip' }), 'burrito.zip');
      await post(`/burrito/zipped/${enc(localRepoPath)}`, { body: form });
    },
  };
};
