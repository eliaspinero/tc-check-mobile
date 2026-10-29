# dev-env — the tc-check lane

The journeys run the client against this repository's rig: the `pankosmia-web` the phone app
ships (`dev-env/rig`, the same pin as `shell/src-tauri`, which `j35` checks), started without a
window, with the shell's own `pankosmia_resources`.

| Piece | Address |
|---|---|
| Rig | `http://127.0.0.1:19980` (every route under `/api`) |
| Vite dev client | `http://127.0.0.1:5180/clients/tc-check/` (proxies `/api` to the rig) |

The rig keeps its state in `dev-env/state/` (git-ignored). Like the shell, it makes that folder
pankosmia-web's home: `pankosmia_repos/` holds the projects and resources, `work/` is the working
folder, and `cache/` holds the seed's downloads.

## Start the rig

```bash
npm run rig
```

The first run builds it (a few minutes). It is ready when
`curl http://127.0.0.1:19980/api/version` names `pkg_version` `0.18.15`.

## Seed it

With the rig running, once:

```bash
npm run rig:seed
```

It places the sample project (`dev-env/seed/sample-burrito`, from the Rust translationCore 4,
see `dev-env/seed/PROVENANCE.md`) as `_local_/_local_/sample_burrito`, and installs every
resource the project pins as `_local_/_sideloaded_/<repo>`. Each resource is downloaded once from
Door43 (`/sb/<tag>.zip`, about 45 MB in all), and installed only when its metadata declares the
pinned commit. This is the only step that uses the network. Running it again keeps what is there.

To start again from an empty rig: stop it, delete `dev-env/state/work/` and
`dev-env/state/pankosmia_repos/`, start it, seed it.

## Run the journeys

```bash
npm run journeys
```

Playwright starts Vite itself. A journey whose prerequisite is missing skips and names it. The
journeys remove what they leave on the rig (`e2e/teardown.ts`), so the next run needs no new seed.
