import { useMemo, useState } from 'react';
import SignIn from './screens/SignIn';
import ProjectList from './screens/ProjectList';
import ResourceInstall from './screens/ResourceInstall';
import { door43Api, type Door43Session } from './door43/door43Api';
import { DCS_SERVER } from './door43/dcsServer';
import { memoryTokenStore } from './door43/tokenStore';
import { pankosmiaSource } from './project/pankosmiaSource';

type Screen = { name: 'projects' } | { name: 'install'; repoPath: string } | { name: 'books'; repoPath: string };

export default function App() {
  const api = useMemo(() => door43Api(), []);
  const store = useMemo(() => memoryTokenStore(), []);
  const source = useMemo(() => pankosmiaSource(), []);
  const host = new URL(DCS_SERVER).host;
  const [session, setSession] = useState<Door43Session | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'projects' });

  if (!session) return <SignIn api={api} store={store} onSignedIn={setSession} />;
  if (screen.name === 'install')
    return (
      <ResourceInstall
        key={screen.repoPath}
        repoPath={screen.repoPath}
        source={source}
        onReady={() => setScreen({ name: 'books', repoPath: screen.repoPath })}
        onBack={() => setScreen({ name: 'projects' })}
      />
    );
  if (screen.name === 'books')
    return (
      <main className="screen">
        <h1>Choose a book</h1>
        <button onClick={() => setScreen({ name: 'projects' })}>Back</button>
      </main>
    );
  return <ProjectList api={api} source={source} session={session} host={host} onOpen={(repoPath) => setScreen({ name: 'install', repoPath })} />;
}
