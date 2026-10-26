# shell — the tC Check app (Tauri)

The phone app. It runs `pankosmia-web` 0.18.15 on `127.0.0.1` inside the app and opens the
`tc-check` client at `/clients/tc-check/`. Our own Rust is this folder only.

Forked from [`pankosmia/mobile-app-template`](https://github.com/pankosmia/mobile-app-template)
at `9a2ebe81ac45df219e67dee179dd66c71e6f161f` (2026-08-31). Changes:

- `pankosmia_web` pinned to `=0.18.15`, the version translationCore 4 pins.
- Product `tC Check`, identifier `io.github.eliaspinero.tccheck`, homepage `tc-check`.
- The template's bundled clients are removed; `app_setup.json` registers `/tc-check` only.
- `src/App.jsx` opens `/clients/tc-check/` instead of `/clients/main`.
- `src-tauri/src/token.rs`: three commands that keep the Door43 token in the app's private
  data directory. The capability lets the local client origin call them.

## Build the client into the shell

From the repository root:

```bash
node scripts/build-client-into-shell.mjs
```

It builds the client and writes it to `src-tauri/pankosmia_resources/lib/clients/tc-check/`
(git-ignored).

## Run on the desktop (fast check)

```bash
cd shell && npm install && npm run build && cd src-tauri && cargo run
```

The window shows the sign-in screen once the server answers. `curl http://127.0.0.1:8000/api/version`
names `pkg_version` `0.18.15`.

## Build the Android APK

Needs a JDK 17, the Android SDK with NDK `27.0.12077973`, the Rust Android targets, and OpenSSL
for Android (`src-tauri/src/openssl/make_openssl.bsh`, see the template's notes below).

```bash
npm run android:tauri -- android init
npm run android:tauri -- android build --apk
```

Android 9 and later block plain `http://` in the WebView. The local server is `http://127.0.0.1`,
so the generated Android project needs the network security config the template describes:
cleartext allowed for `127.0.0.1` and `localhost` only.

The APK must be signed (`keytool` and `apksigner`); `build-android.sh` is the template's script.
Never commit a keystore.
