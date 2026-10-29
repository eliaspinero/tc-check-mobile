// The phone: the token is kept by the Tauri shell (shell/src-tauri/src/token.rs) in the app's
// private data directory, through IPC. The page is served by the local Pankosmia server, which
// the shell's capability lists as a remote origin allowed to call these commands.
import type { TokenStore } from './tokenStore';
import { invokeOf } from '../device/tauri';

export { inTauri } from '../device/tauri';

export const tauriTokenStore = (): TokenStore => {
  const invoke = invokeOf();
  if (!invoke) throw new Error('tauriTokenStore needs the Tauri shell');
  return {
    keep: async (token) => void (await invoke('token_keep', { token })),
    read: async () => ((await invoke('token_read')) as string | null) ?? null,
    forget: async () => void (await invoke('token_forget')),
  };
};
