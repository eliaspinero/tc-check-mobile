import { useEffect, useMemo, useRef, useState } from 'react';
import SignIn from './screens/SignIn';
import ProjectList from './screens/ProjectList';
import ResourceInstall from './screens/ResourceInstall';
import BookPicker from './screens/BookPicker';
import CheckList from './screens/CheckList';
import CheckScreen from './screens/CheckScreen';
import Skeleton from './screens/Skeleton';
import { Door43ApiError, door43Api, type Door43Session } from './door43/door43Api';
import { DCS_SERVER } from './door43/dcsServer';
import { memoryTokenStore } from './door43/tokenStore';
import { inTauri, tauriTokenStore } from './door43/tauriTokenStore';
import { pankosmiaSource } from './project/pankosmiaSource';
import { tsEngine } from './engine/tsEngine';
import type { Tool } from './engine/CheckingEngine';
import type { Session } from './session/loadSession';
import { t } from './i18n';

type Screen =
  | { name: 'projects' }
  | { name: 'install'; repoPath: string }
  | { name: 'books'; repoPath: string }
  | { name: 'list'; repoPath: string; book: string; tool: Tool; focus?: number }
  | { name: 'check'; repoPath: string; book: string; tool: Tool; session: Session; index: number };

export default function App() {
  const api = useMemo(() => door43Api(), []);
  const store = useMemo(() => (inTauri() ? tauriTokenStore() : memoryTokenStore()), []);
  const source = useMemo(() => pankosmiaSource(), []);
  const engine = tsEngine;
  const host = new URL(DCS_SERVER).host;
  // Restoring until the kept token is restored or found missing: the sign-in form must not show meanwhile,
  // or a checker on slow data signs in again and races the restore (the new token could be forgotten).
  const [auth, setAuth] = useState<{ state: 'restoring' } | { state: 'signedOut' } | { state: 'signedIn'; session: Door43Session }>({ state: 'restoring' });
  const session = auth.state === 'signedIn' ? auth.session : null;
  const signIn = (s: Door43Session) => setAuth({ state: 'signedIn', session: s });
  const [screen, setScreen] = useState<Screen>({ name: 'projects' });
  // Into a screen, the new screen slides in from the end; Back, from the start (app.css, `data-nav`). Moves
  // within a screen (a check to the next) use setScreen and keep the screen where it is.
  const go = (next: Screen, back = false) => {
    document.documentElement.dataset.nav = back ? 'back' : 'forward';
    setScreen(next);
  };
  // The session screens act for. Sign-out clears it at once, so work that ends later (a clone) opens nothing.
  const live = useRef<Door43Session | null>(null);
  useEffect(() => {
    live.current = session;
  }, [session]);
  // Clones still running, kept across sign-out so signing in again does not start a second clone of the same project.
  const [cloning, setCloning] = useState<ReadonlySet<string>>(new Set());
  const onCloning = (key: string, running: boolean) =>
    setCloning((prev) => {
      const next = new Set(prev);
      if (running) next.add(key);
      else next.delete(key);
      return next;
    });

  // A token kept from an earlier session signs the checker in again. Only Door43's own refusal (401/403)
  // forgets it; with no internet the checker keeps working on the projects already on this device.
  useEffect(() => {
    store
      .read()
      .then(async (token) => {
        if (!token) return setAuth({ state: 'signedOut' });
        try {
          signIn({ username: await api.userOf(token), token });
        } catch (e) {
          if (e instanceof Door43ApiError && (e.status === 401 || e.status === 403)) {
            await store.forget();
            setAuth({ state: 'signedOut' });
          } else signIn({ username: '', token });
        }
      })
      .catch(() => setAuth({ state: 'signedOut' }));
  }, [api, store]);

  // Sign out: the kept token leaves this device and the sign-in form shows. No Door43 call, as tC4's signOut.
  const signOut = () => {
    live.current = null;
    store
      .forget()
      .catch(() => undefined)
      .finally(() => {
        setAuth({ state: 'signedOut' });
        setScreen({ name: 'projects' });
      });
  };

  if (auth.state === 'restoring')
    return (
      <main className="screen">
        <Skeleton shape="projects" label={t('signingYouIn')} />
      </main>
    );
  if (!session) return <SignIn api={api} store={store} onSignedIn={signIn} />;
  switch (screen.name) {
    case 'install':
      return (
        <ResourceInstall
          key={screen.repoPath}
          repoPath={screen.repoPath}
          source={source}
          onReady={() => go({ name: 'books', repoPath: screen.repoPath })}
          onBack={() => go({ name: 'projects' }, true)}
        />
      );
    case 'books':
      return (
        <BookPicker
          repoPath={screen.repoPath}
          source={source}
          engine={engine}
          onPick={(book, tool) => go({ name: 'list', repoPath: screen.repoPath, book, tool })}
          onBack={() => go({ name: 'projects' }, true)}
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
          focus={screen.focus}
          onOpen={(s, index) => go({ ...screen, name: 'check', session: s, index })}
          onBack={() => go({ name: 'books', repoPath: screen.repoPath }, true)}
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
          // A save lands after the tap; by then the checker may have moved on. Only the screen it was made
          // on, still showing the same list, takes the new session, at whichever check it shows now.
          onDecided={(s) =>
            setScreen((cur) =>
              cur.name === 'check' && cur.repoPath === screen.repoPath && cur.book === screen.book && cur.tool === screen.tool ? { ...cur, session: s } : cur,
            )
          }
          onBack={() => go({ name: 'list', repoPath: screen.repoPath, book: screen.book, tool: screen.tool, focus: screen.index }, true)}
        />
      );
    default:
      return <ProjectList api={api} source={source} session={session} host={host} onOpen={(repoPath) => live.current === session && go({ name: 'install', repoPath })} onSignOut={signOut} cloning={cloning} onCloning={onCloning} />;
  }
}
