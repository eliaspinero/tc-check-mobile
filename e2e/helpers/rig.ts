// The tc-check lane: a pankosmia-web rig on 19980 and the Vite dev client on 5180,
// so it never collides with tC4's lanes (19998 and 19990/5190). See dev-env/README.md.
export const RIG_URL = 'http://127.0.0.1:19980';
export const CLIENT_URL = 'http://127.0.0.1:5180/clients/tc-check/';

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
