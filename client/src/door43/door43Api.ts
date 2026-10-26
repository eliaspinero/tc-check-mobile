// The one module that calls the Door43 API. Shapes and the sign-in flow follow tC4's
// src/data/share/door43Api.ts and session.ts (swagger 1.27.3+dcs): Basic auth reads the login,
// deletes the app's old token, mints a new one, and from then on only the token travels, in the
// Authorization header, never in a URL.
import { DCS_SERVER } from './dcsServer';

export const TOKEN_NAME = 'tc-check-mobile';
export const TOKEN_SCOPES: readonly string[] = Object.freeze(['write:repository', 'write:organization', 'write:user']);

export interface Door43Session {
  username: string;
  token: string;
}
export interface Door43Repo {
  owner: string;
  name: string;
  description: string;
}

export class Door43ApiError extends Error {
  constructor(
    readonly route: string,
    readonly status: number,
    readonly reason: string,
  ) {
    super(reason);
    this.name = 'Door43ApiError';
  }
}

const messageOf = (text: string): string => {
  try {
    const parsed = JSON.parse(text) as { message?: unknown };
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    // not JSON
  }
  return text.slice(0, 200) || '(empty answer)';
};

const basic = (login: string, password: string): string => {
  const bytes = new TextEncoder().encode(`${login}:${password}`);
  return `Basic ${btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))}`;
};

type RepoRow = { name: string; owner: { login: string }; description?: string };

export const door43Api = (server: string = DCS_SERVER, fetchFn: typeof fetch = (...a) => fetch(...a)) => {
  const request = async (route: string, authorization: string, init: { method?: string; body?: unknown } = {}): Promise<Response> => {
    const headers: Record<string, string> = { Accept: 'application/json', Authorization: authorization };
    const req: RequestInit = { method: init.method ?? 'GET', headers };
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      req.body = JSON.stringify(init.body);
    }
    let res: Response;
    try {
      res = await fetchFn(`${server}/api/v1${route}`, req);
    } catch (e) {
      throw new Door43ApiError(route, 0, `Door43 can't be reached: ${String((e as Error)?.message ?? e)}`);
    }
    if (!res.ok) throw new Door43ApiError(route, res.status, messageOf(await res.text()));
    return res;
  };
  const pages = async <T,>(route: string, auth: string): Promise<T[]> => {
    const out: T[] = [];
    for (let page = 1; ; page++) {
      const rows = (await (await request(`${route}?limit=50&page=${page}`, auth)).json()) as T[];
      out.push(...rows);
      if (rows.length < 50) return out;
    }
  };
  const toRepo = (r: RepoRow): Door43Repo => ({ owner: r.owner.login, name: r.name, description: r.description ?? '' });

  return {
    /** Sign in with a login (username or email) and password; returns the session with a fresh token. */
    async signIn(login: string, password: string): Promise<Door43Session> {
      const auth = basic(login, password);
      const { login: username } = (await (await request('/user', auth)).json()) as { login: string };
      const user = encodeURIComponent(username);
      const tokens = (await (await request(`/users/${user}/tokens`, auth)).json()) as Array<{ id: number; name: string }>;
      for (const t of tokens.filter((t) => t.name === TOKEN_NAME)) await request(`/users/${user}/tokens/${t.id}`, auth, { method: 'DELETE' });
      const minted = (await (
        await request(`/users/${user}/tokens`, auth, { method: 'POST', body: { name: TOKEN_NAME, scopes: TOKEN_SCOPES } })
      ).json()) as { sha1: string };
      return { username, token: minted.sha1 };
    },
    /** The login a kept token belongs to; a 401 means the token was revoked. */
    async userOf(token: string): Promise<string> {
      return ((await (await request('/user', `token ${token}`)).json()) as { login: string }).login;
    },
    /** The user's own repositories and those of each organization they belong to, once each. */
    async listRepos(session: Door43Session): Promise<Door43Repo[]> {
      const auth = `token ${session.token}`;
      const own = (await pages<RepoRow>('/user/repos', auth)).map(toRepo);
      const orgs = await pages<{ username: string }>('/user/orgs', auth);
      const fromOrgs = (await Promise.all(orgs.map((o) => pages<RepoRow>(`/orgs/${encodeURIComponent(o.username)}/repos`, auth)))).flat().map(toRepo);
      const seen = new Set<string>();
      return [...own, ...fromOrgs].filter((r) => {
        const key = `${r.owner}/${r.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
  };
};
export type Door43Api = ReturnType<typeof door43Api>;
