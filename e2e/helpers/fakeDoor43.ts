// A fake Door43 for the journeys, in the manner of tC4's e2e/helpers/door43.ts: the API calls
// the app makes, answered from memory with Door43's shapes and messages (swagger 1.27.3+dcs,
// read by tC4 2026-09-28). Every request is kept in `calls`, so a journey can assert that no
// URL carries the token.
import type { BrowserContext } from '@playwright/test';

export const QA_SERVER = 'https://qa.door43.org';

export interface FakeRepo { owner: string; name: string; description?: string }
export interface FakeDoor43Options {
  user: { username: string; password: string };
  organizations?: string[];
  repos?: FakeRepo[];
}
export interface FakeDoor43 { calls: Array<{ method: string; url: string }>; tokens: Map<number, { name: string; sha1: string }> }

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  status,
  contentType: 'application/json',
  headers: { 'Access-Control-Allow-Origin': '*', ...headers },
  body: JSON.stringify(body),
});
const UNAUTHORIZED = json(401, { message: 'invalid username, password or token', url: `${QA_SERVER}/api/swagger` });

export const fakeDoor43 = async (context: BrowserContext, opts: FakeDoor43Options): Promise<FakeDoor43> => {
  const state: FakeDoor43 = { calls: [], tokens: new Map() };
  let nextId = 1;
  const basic = `Basic ${Buffer.from(`${opts.user.username}:${opts.user.password}`).toString('base64')}`;
  const authorized = (auth: string | undefined): boolean => {
    if (!auth) return false;
    if (auth === basic) return true;
    const m = /^token (\S+)$/.exec(auth);
    return !!m && [...state.tokens.values()].some((t) => t.sha1 === m[1]);
  };
  const repoJson = (r: FakeRepo) => ({
    name: r.name,
    full_name: `${r.owner}/${r.name}`,
    owner: { login: r.owner },
    description: r.description ?? '',
    clone_url: `${QA_SERVER}/${r.owner}/${r.name}.git`,
  });

  await context.route(`${QA_SERVER}/api/v1/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    state.calls.push({ method, url: req.url() });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
    if (!authorized(req.headers()['authorization'])) return route.fulfill(UNAUTHORIZED);
    const p = url.pathname.replace(/^\/api\/v1/, '');
    const u = opts.user.username;
    if (method === 'GET' && p === '/user') return route.fulfill(json(200, { login: u }));
    if (method === 'GET' && p === `/users/${u}/tokens`)
      return route.fulfill(json(200, [...state.tokens].map(([id, t]) => ({ id, name: t.name, token_last_eight: t.sha1.slice(-8) }))));
    const del = new RegExp(`^/users/${u}/tokens/(\\d+)$`).exec(p);
    if (method === 'DELETE' && del) {
      state.tokens.delete(Number(del[1]));
      return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (method === 'POST' && p === `/users/${u}/tokens`) {
      const { name } = JSON.parse(req.postData() ?? '{}') as { name: string };
      if ([...state.tokens.values()].some((t) => t.name === name)) return route.fulfill(json(400, { message: 'access token name has been used already' }));
      const sha1 = `f${String(nextId).padStart(39, '0')}`;
      const id = nextId++;
      state.tokens.set(id, { name, sha1 });
      return route.fulfill(json(201, { id, name, sha1, token_last_eight: sha1.slice(-8) }));
    }
    if (method === 'GET' && p === '/user/orgs') {
      const page = Number(url.searchParams.get('page') ?? '1');
      return route.fulfill(json(200, page === 1 ? (opts.organizations ?? []).map((o) => ({ username: o, full_name: o })) : []));
    }
    if (method === 'GET' && p === '/user/repos') {
      const page = Number(url.searchParams.get('page') ?? '1');
      return route.fulfill(json(200, page === 1 ? (opts.repos ?? []).filter((r) => r.owner === u).map(repoJson) : []));
    }
    const org = /^\/orgs\/([^/]+)\/repos$/.exec(p);
    if (method === 'GET' && org) {
      const page = Number(url.searchParams.get('page') ?? '1');
      return route.fulfill(json(200, page === 1 ? (opts.repos ?? []).filter((r) => r.owner === org[1]).map(repoJson) : []));
    }
    return route.fulfill(json(404, { message: `fake Door43 has no route ${method} ${p}` }));
  });
  return state;
};
