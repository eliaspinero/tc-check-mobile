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
