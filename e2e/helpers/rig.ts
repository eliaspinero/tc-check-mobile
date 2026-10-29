// The tc-check lane: a pankosmia-web rig on 19980 and the Vite dev client on 5180,
// so it never collides with tC4's lanes (19998 and 19990/5190). See dev-env/README.md.
// CLIENT_PORT moves Vite for a worktree whose sibling already holds 5180; the rig stays shared.
export const RIG_URL = 'http://127.0.0.1:19980';
export const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5180);
export const CLIENT_URL = `http://127.0.0.1:${CLIENT_PORT}/clients/tc-check/`;

/** True when the rig answers `GET /api/version`. */
export const rigUp = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${RIG_URL}/api/version`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
};

export const NEEDS_RIG = 'needs the pankosmia rig on 19980 (dev-env/README.md)';

const post = async (route: string): Promise<void> => {
  const res = await fetch(`${RIG_URL}/api${route}`, { method: 'POST' });
  const body = (await res.json()) as { is_good?: boolean; reason?: string };
  if (!body.is_good) throw new Error(`rig ${route}: ${body.reason}`);
};

export const listLocal = async (): Promise<string[]> => (await (await fetch(`${RIG_URL}/api/git/list-local-repos`)).json()) as string[];

/** Put a copy of a rig repo at `target` (for example a Door43-shaped path), replacing any old copy. */
export const placeRepo = async (src: string, target: string): Promise<void> => {
  if ((await listLocal()).includes(target)) await post(`/git/delete/${target}`);
  await post(`/git/copy/${src}?target_path=${encodeURIComponent(target)}`);
};

/** The tC4 conformance sample project that tC4's seed puts on the rig. */
export const SAMPLE_PROJECT = '_local_/_local_/sample_burrito';
/** A repo on the rig that is a burrito but not a tC4 project (no checking/resources.json). */
export const PLAIN_REPO = '_local_/_sideloaded_/en_tw';

/** Test setup only: write one ingredient of a rig repo (the app itself never writes in slice 1). */
export const writeIngredient = async (repoPath: string, ipath: string, text: string): Promise<void> => {
  const res = await fetch(`${RIG_URL}/api/burrito/ingredient/raw/${repoPath}?ipath=${encodeURIComponent(ipath)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: text }),
  });
  const body = (await res.json()) as { is_good?: boolean; reason?: string };
  if (!body.is_good) throw new Error(`rig write ${ipath}: ${body.reason}`);
};

export const readMetadata = async (repoPath: string): Promise<Record<string, unknown>> =>
  (await (await fetch(`${RIG_URL}/api/burrito/metadata/raw/${repoPath}`)).json()) as Record<string, unknown>;

/** Every file under a rig repo's ingredients/, as ingredient-relative paths. */
export const listPaths = async (repoPath: string): Promise<string[]> => (await (await fetch(`${RIG_URL}/api/burrito/paths/${repoPath}`)).json()) as string[];

export const readIngredient = async (repoPath: string, ipath: string): Promise<string> =>
  (await fetch(`${RIG_URL}/api/burrito/ingredient/raw/${repoPath}?ipath=${encodeURIComponent(ipath)}`)).text();

export const deleteRepoIfPresent = async (repoPath: string): Promise<void> => {
  if ((await listLocal()).includes(repoPath)) await post(`/git/delete/${repoPath}`);
};

/** en_ust v90: a real release the rig does not hold (tC4's seed installs v91). 9.5 MB. */
export const UST_V90 = {
  repoPath: 'git.door43.org/unfoldingWord/en_ust',
  version: 'v90',
  sha: 'e254f81aa7668a30fef2de929453a3550d4524a2',
  flavor: 'scripture/textTranslation',
};
export const UST_V90_INSTALL = '_local_/_sideloaded_/unfoldingword--en_ust';

/** A copy of the sample project whose UST pane pin is en_ust v90, so exactly one pin is missing. */
export const placeProjectMissingUstV90 = async (target: string): Promise<void> => {
  await placeRepo(SAMPLE_PROJECT, target);
  const resources = JSON.parse(await readIngredient(target, 'checking/resources.json')) as { extraScripture: Array<Record<string, unknown>> };
  resources.extraScripture = resources.extraScripture.map((p) => (String(p.repoPath).endsWith('/en_ust') ? { ...p, ...UST_V90 } : p));
  await writeIngredient(target, 'checking/resources.json', JSON.stringify(resources, null, 2));
};

/** The rig's repos directory on disk (tC4 dev-env/state/work/repos), for a file:// remote. Needs TC4_DIR. */
export const rigReposDir = (): string | null =>
  process.env.TC4_DIR ? `${process.env.TC4_DIR.replace(/\\/g, '/').replace(/\/+$/, '')}/dev-env/state/work/repos` : null;
export const NEEDS_TC4_DIR = 'needs TC4_DIR (a translationCore4 checkout whose dev-env runs the rig) for a file:// origin';

export const addOrigin = async (repoPath: string, url: string): Promise<void> =>
  post(`/git/remote/add/${repoPath}?remote_name=origin&remote_url=${encodeURIComponent(url)}`);

export const commitAll = async (repoPath: string, message: string): Promise<void> => {
  const res = await fetch(`${RIG_URL}/api/git/add-and-commit/${repoPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commit_message: message }),
  });
  const body = (await res.json()) as { is_good?: boolean; reason?: string };
  if (!body.is_good) throw new Error(`rig commit ${repoPath}: ${body.reason}`);
};

/** en_ust v89: a second real release the rig does not hold. */
export const UST_V89 = { repoPath: 'git.door43.org/unfoldingWord/en_ust', version: 'v89', sha: '37ec223166bbd73fb55abc7840be8310c0fee7f2', flavor: 'scripture/textTranslation' };
/** Where a second sha of en_ust installs while the canonical path holds another (tC4 state.jsx: --<sha12>). */
export const suffixInstall = (sha: string): string => `${UST_V90_INSTALL}--${sha.slice(0, 12)}`;

/** A copy of the sample project whose UST pane pin is replaced by `pin` (leave out `version` for a sha-only pin). */
export const placeProjectWithUst = async (target: string, pin: Record<string, unknown>): Promise<void> => {
  await placeRepo(SAMPLE_PROJECT, target);
  const resources = JSON.parse(await readIngredient(target, 'checking/resources.json')) as { extraScripture: Array<Record<string, unknown>> };
  resources.extraScripture = resources.extraScripture.map((p) => (String(p.repoPath).endsWith('/en_ust') ? { id: p.id, ...pin } : p));
  await writeIngredient(target, 'checking/resources.json', JSON.stringify(resources, null, 2));
};

/** A copy of the sample project whose pins carry no `books` (projects pinned before tC4 D41). */
export const placeProjectWithoutPinBooks = async (target: string): Promise<void> => {
  await placeRepo(SAMPLE_PROJECT, target);
  const strip = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(strip);
    if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'books').map(([k, v]) => [k, strip(v)]));
    return o;
  };
  const resources = strip(JSON.parse(await readIngredient(target, 'checking/resources.json')));
  await writeIngredient(target, 'checking/resources.json', JSON.stringify(resources, null, 2));
};
