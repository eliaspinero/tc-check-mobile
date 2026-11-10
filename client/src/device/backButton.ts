// Android's Back from the Tauri shell (#58). While a page listens for the app plugin's `back-button` event, the shell
// sends Back there and does nothing else (tauri 2.11, AppPlugin.kt); with no listener it goes back in the WebView's
// history or leaves the app. This is what @tauri-apps/api's addPluginListener does, without adding the package to the
// client for one call: a callback registered with the bridge stands for the channel, and its id goes to the plugin as
// `__CHANNEL__:<id>`. The wire format is tauri 2.11's (shell/src-tauri pins it), seen on the emulator.
import { bridgeOf } from './tauri';

/** Start listening for Android's Back; the returned function stops. Outside the shell (a browser) there is no Back to
 * listen for. */
export const listenBack = async (onBack: () => void): Promise<() => Promise<void>> => {
  const tauri = bridgeOf();
  if (!tauri) return async () => undefined;
  const id = tauri.transformCallback(onBack);
  await tauri.invoke('plugin:app|register_listener', { event: 'back-button', handler: `__CHANNEL__:${id}` });
  return async () => {
    await tauri.invoke('plugin:app|remove_listener', { event: 'back-button', channelId: id });
    tauri.unregisterCallback(id);
  };
};
