import { useState } from 'react';
import type { Door43Api, Door43Session } from '../door43/door43Api';
import type { TokenStore } from '../door43/tokenStore';
import { t } from '../i18n';
import { door43ErrorText } from './door43Error';

export default function SignIn({ api, store, onSignedIn }: { api: Door43Api; store: TokenStore; onSignedIn: (s: Door43Session) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password) {
      setError(t('enterCredentials'));
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
      setError(door43ErrorText(err, true));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="screen" onSubmit={submit}>
      <header className="topbar" role="banner">
        <div className="topbar-place">
          <div className="brand" data-testid="app-name">
            {t('appName')}
          </div>
          <h1>{t('signInTitle')}</h1>
        </div>
      </header>
      <label>
        {t('username')}
        <input autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} />
      </label>
      <label>
        {t('password')}
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? t('signingIn') : t('signIn')}
      </button>
    </form>
  );
}
