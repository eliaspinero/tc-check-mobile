import { useState } from 'react';
import type { Door43Api, Door43Session } from '../door43/door43Api';
import type { TokenStore } from '../door43/tokenStore';

export default function SignIn({ api, store, onSignedIn }: { api: Door43Api; store: TokenStore; onSignedIn: (s: Door43Session) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await api.signIn(login.trim(), password);
      setPassword('');
      await store.keep(session.token);
      onSignedIn(session);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="screen" onSubmit={submit}>
      <h1>Sign in to Door43</h1>
      <label>
        Username or email
        <input autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} />
      </label>
      <label>
        Password
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
