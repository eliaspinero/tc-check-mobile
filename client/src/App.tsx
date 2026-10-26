import { useMemo, useState } from 'react';
import SignIn from './screens/SignIn';
import { door43Api, type Door43Session } from './door43/door43Api';
import { memoryTokenStore } from './door43/tokenStore';

export default function App() {
  const api = useMemo(() => door43Api(), []);
  const store = useMemo(() => memoryTokenStore(), []);
  const [session, setSession] = useState<Door43Session | null>(null);

  if (!session) return <SignIn api={api} store={store} onSignedIn={setSession} />;
  return (
    <main className="screen">
      <h1>Your projects</h1>
    </main>
  );
}
