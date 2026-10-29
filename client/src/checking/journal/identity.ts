// Copied from unfoldingWord/translationCore4 src/data/journal/identity.ts at b1911407b00577bf04c4bed1499bd5ac45423b0b. Changes: only toHex and deriveActorId (lines 142-200); the repoPath is checked by its three segments here instead of serverApi.assertRepoPath; the installation secret is kept by the caller.

const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/** The §8.1 actor-slug grammar the derived id must satisfy (R-8.1.11). Stated
 * here for the derivation's own postcondition check; the one authoritative copy
 * is journal/grammar.mjs ACTOR_RE. */
const ACTOR_SLUG_RE = /^[a-z0-9-]{4,32}$/;

/** Derive the per-project actor id: 'a' + the first 15 hex chars of
 * HMAC-SHA-256(key: secret, message: repoPath). 16 chars total, starts with a
 * letter, well inside the §8.1 slug grammar. Deterministic (same secret + same
 * repoPath = same id), project-scoped (different repoPath = different id, D53c),
 * and one-way (HMAC — the id exposes nothing of the secret). */
export const deriveActorId = async (secret: string, repoPath: string): Promise<string> => {
  // The case is never folded: two projects whose paths differ only in case derive two ids (D53c).
  if (repoPath.split('/').length !== 3 || repoPath.split('/').some((part) => part === ''))
    throw new Error(`deriveActorId: ${JSON.stringify(repoPath)} is not a <host>/<owner>/<repo> path`);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(repoPath)));
  const actorId = `a${toHex(mac).slice(0, 15)}`;
  if (!ACTOR_SLUG_RE.test(actorId)) {
    // Unreachable by construction ('a' + 15 hex chars); kept as a postcondition
    // so a future edit cannot silently emit a non-slug into directory names.
    throw new Error(`derived actor id ${JSON.stringify(actorId)} is not an §8.1 slug`);
  }
  return actorId;
};

/** A new installation secret: 32 random bytes, hex-encoded (tC4 getInstallationSecret's mint). */
export const newInstallationSecret = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
};
