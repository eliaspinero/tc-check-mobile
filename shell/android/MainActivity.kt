// Replaces the MainActivity that `tauri android init` writes (scripts/prepare-android.mjs copies this file over it).
// Tauri's own does only enableEdgeToEdge(): the app is drawn under the status bar and the navigation bar, as Android 15
// does for every app anyway. The WebView may then report 0 for env(safe-area-inset-*) (WebView 124 does), so this activity
// tells the page how tall the bars are: window.tcSystemBars.insets() returns them in CSS pixels (dp), and a
// `tc-system-bars` event says they changed. client/src/systemBars.ts reads them.
package org.unfoldingword.tccheck

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // wry calls this before the WebView loads its first page, so the bridge is there from the start.
  override fun onWebViewCreate(webView: WebView) {
    val bars = SystemBars()
    webView.addJavascriptInterface(bars, "tcSystemBars")
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val room = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val density = resources.displayMetrics.density
      val top = room.top / density
      val bottom = room.bottom / density
      // Insets are applied again for other reasons too (the keyboard opening); tell the page only when the bars changed.
      if (top != bars.top || bottom != bars.bottom) {
        bars.top = top
        bars.bottom = bottom
        webView.evaluateJavascript("window.dispatchEvent(new Event('tc-system-bars'))", null)
      }
      ViewCompat.onApplyWindowInsets(view, insets)
    }
  }

  // The page calls insets() on the WebView's own thread, hence @Volatile.
  class SystemBars {
    @Volatile var top = 0f
    @Volatile var bottom = 0f

    @JavascriptInterface
    fun insets(): String = """{"top":$top,"bottom":$bottom}"""
  }
}
