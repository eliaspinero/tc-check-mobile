import { useEffect, useMemo, useState } from 'react';
import SignIn from './screens/SignIn';
import ProjectList from './screens/ProjectList';
import ResourceInstall from './screens/ResourceInstall';
import BookPicker from './screens/BookPicker';
import CheckList from './screens/CheckList';
import CheckScreen from './screens/CheckScreen';
import { door43Api, type Door43Session } from './door43/door43Api';
import { DCS_SERVER } from './door43/dcsServer';
import { memoryTokenStore } from './door43/tokenStore';
import { inTauri, tauriTokenStore } from './door43/tauriTokenStore';
import { pankosmiaSource } from './project/pankosmiaSource';
import { tsEngine } from './engine/tsEngine';
import type { Tool } from './engine/CheckingEngine';
import type { Session } from './session/loadSession';

type Screen =
  | { name: 'projects' }
  | { name: 'install'; repoPath: string }
  | { name: 'books'; repoPath: string }
  | { name: 'list'; repoPath: string; book: string; tool: Tool }
  | { name: 'check'; repoPath: string; book: string; tool: Tool; session: Session; index: number };

export default function App() {
  const api = useMemo(() => door43Api(), []);
  const store = useMemo(() => (inTauri() ? tauriTokenStore() : memoryTokenStore()), []);
  const source = useMemo(() => pankosmiaSource(), []);
  const engine = tsEngine;
  const host = new URL(DCS_SERVER).host;
  const [session, setSession] = useState<Door43Session | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'projects' });

  // A token kept from an earlier session signs the checker in again; a revoked one is forgotten.
  useEffect(() => {
    store.read().then(async (token) => {
      if (!token) return;
      try {
        setSession({ username: await api.userOf(token), token });
      } catch {
        await store.forget();
      }
    });
  }, [api, store]);

  if (!session) return <SignIn api={api} store={store} onSignedIn={setSession} />;
  switch (screen.name) {
    case 'install':
      return (
        <ResourceInstall
          key={screen.repoPath}
          repoPath={screen.repoPath}
          source={source}
          onReady={() => setScreen({ name: 'books', repoPath: screen.repoPath })}
          onBack={() => setScreen({ name: 'projects' })}
        />
      );
    case 'books':
      return (
        <BookPicker
          repoPath={screen.repoPath}
          source={source}
          onPick={(book, tool) => setScreen({ name: 'list', repoPath: screen.repoPath, book, tool })}
          onBack={() => setScreen({ name: 'projects' })}
        />
      );
    case 'list':
      return (
        <CheckList
          repoPath={screen.repoPath}
          book={screen.book}
          tool={screen.tool}
          source={source}
          engine={engine}
          onOpen={(s, index) => setScreen({ ...screen, name: 'check', session: s, index })}
          onBack={() => setScreen({ name: 'books', repoPath: screen.repoPath })}
        />
      );
    case 'check':
      return (
        <CheckScreen
          repoPath={screen.repoPath}
          book={screen.book}
          tool={screen.tool}
          session={screen.session}
          index={screen.index}
          source={source}
          engine={engine}
          onIndex={(index) => setScreen({ ...screen, index })}
          onBack={() => setScreen({ name: 'list', repoPath: screen.repoPath, book: screen.book, tool: screen.tool })}
        />
      );
    default:
      return <ProjectList api={api} source={source} session={session} host={host} onOpen={(repoPath) => setScreen({ name: 'install', repoPath })} />;
  }
}
