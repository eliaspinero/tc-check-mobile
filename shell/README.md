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
node scripts/build-client-into-shell.mjs --qa
```

It builds the client and writes it to `src-tauri/pankosmia_resources/lib/clients/tc-check/`
(git-ignored). With `--qa` the client talks to `qa.door43.org`: use it for every test APK and
phone check. Without it the client talks to production `git.door43.org`; only a store build
(slice 3) leaves it out. The script fails when the bundle names the other server.

## Run on the desktop (fast check)

```bash
cd shell && npm install && npm run build && cd src-tauri && cargo run
```

The window shows the sign-in screen once the server answers. `curl http://127.0.0.1:8000/api/version`
names `pkg_version` `0.18.15`.

## Build the Android APK

The easy way needs nothing on your computer. The workflow `.github/workflows/android-qa-apk.yml`
builds the test APK on GitHub for every pull request, and you can also start it by hand from the
Actions tab. Open the run and download the `tc-check-qa-apk` artifact. It is a zip that holds
`tc-check-qa-<commit>.apk`, an arm64 build whose client talks to `qa.door43.org`. Each run signs
with a key made for that run only, so uninstall the old build before you install a newer one.

To build on your own machine you need a JDK 17, the Android SDK with NDK `27.0.12077973`, the
Rust Android targets (`dev-env/install-android-toolchain.ps1` installs them on Windows), and
OpenSSL for Android. Build OpenSSL from `src-tauri/src/openssl`, on Linux or WSL:

```bash
ANDROID_NDK_HOME="<sdk>/ndk/27.0.12077973" bash make_openssl.bsh android-arm64
```

Then, from `shell/`, after `node scripts/build-client-into-shell.mjs --qa` at the repository root:

```bash
npm run android:tauri -- android init
node ../scripts/prepare-android.mjs
npm run android:tauri -- android build --apk --target aarch64
```

Android 9 and later block plain `http://` in the WebView, and the local server is
`http://127.0.0.1:8000`. `prepare-android.mjs` adds the network security config in
`shell/android/`, which allows cleartext for `127.0.0.1` and `localhost` only. Run it after every
`android init`, because init recreates the git-ignored `src-tauri/gen/android`.

The APK must be signed (`keytool` and `apksigner`); the workflow shows how, and
`build-android.sh` is the template's script. Never commit a keystore.
