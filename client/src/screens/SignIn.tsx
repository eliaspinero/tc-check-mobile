import { useState } from 'react';
import type { Door43Api, Door43Session } from '../door43/door43Api';
import type { TokenStore } from '../door43/tokenStore';
import { t } from '../i18n';
import { door43ErrorText } from './door43Error';
import ErrorLine from './ErrorLine';
import { IDLE, failure, type Run } from './load';

export default function SignIn({ api, store, onSignedIn }: { api: Door43Api; store: TokenStore; onSignedIn: (s: Door43Session) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Run<{ state: 'signingIn' }>>(IDLE);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password) {
      setStatus({ state: 'failed', message: t('enterCredentials') });
      return;
    }
    setStatus({ state: 'signingIn' });
    try {
      const session = await api.signIn(login.trim(), password);
      setPassword('');
      await store.keep(session.token);
      onSignedIn(session);
      setStatus(IDLE);
    } catch (err) {
      setStatus({ state: 'failed', message: door43ErrorText(err, true) });
    }
  };
  const signingIn = status.state === 'signingIn';

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
      <ErrorLine text={failure(status)} />
      <button className="primary" type="submit" disabled={signingIn}>
        {signingIn ? t('signingIn') : t('signIn')}
      </button>
    </form>
  );
}
