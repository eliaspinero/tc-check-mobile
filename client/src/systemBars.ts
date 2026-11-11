// On Android the app is drawn edge to edge, under the status bar and the navigation bar, and the WebView may report 0 for
// env(safe-area-inset-*) (WebView 124 on Android 15 does). The shell tells the page how tall the bars are instead
// (shell/android/MainActivity.kt): window.tcSystemBars.insets() gives them in CSS pixels, and a `tc-system-bars` event says
// they changed (the phone turned, the navigation mode changed). They go to --safe-top and --safe-bottom, which app.css
// reads. In a browser there is no bridge, and those properties keep env()'s values (theme.css).

type SystemBars = { insets(): string };

export function followSystemBars(): void {
  const bridge = (window as { tcSystemBars?: SystemBars }).tcSystemBars;
  if (!bridge) return;
  const apply = () => {
    const { top, bottom } = JSON.parse(bridge.insets()) as { top: number; bottom: number };
    document.documentElement.style.setProperty('--safe-top', `${top}px`);
    document.documentElement.style.setProperty('--safe-bottom', `${bottom}px`);
  };
  apply();
  window.addEventListener('tc-system-bars', apply);
}
