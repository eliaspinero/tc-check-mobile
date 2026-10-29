// The installation secret this phone's journal actor id derives from (tC4 identity.ts, D53c).
// On the phone the Tauri shell keeps it (shell/src-tauri/src/device.rs); in the browser and the
// journeys, localStorage keeps it. It is not a credential: it only keeps the actor id the same.
import { invokeOf } from './tauri';

const KEY = 'tc-check-installation-secret';

/** The kept secret; on first use `mint()` makes it. */
export const deviceSecret = async (mint: () => string): Promise<string> => {
  const invoke = invokeOf();
  if (invoke) return (await invoke('device_secret', { candidate: mint() })) as string;
  try {
    const kept = localStorage.getItem(KEY);
    if (kept) return kept;
    const secret = mint();
    localStorage.setItem(KEY, secret);
    return secret;
  } catch {
    return mint();
  }
};
