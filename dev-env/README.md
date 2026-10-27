# dev-env — the tc-check lane

The journeys run the client against a `pankosmia-web` 0.18.15 rig. This repository does not
build its own rig: it runs the rig that translationCore 4 builds in its `dev-env/`
(`tc4_dev_server`, pankosmia-web 0.18.15), on its own port.

| Piece | Address |
|---|---|
| Rig | `http://127.0.0.1:19980` (every route under `/api`) |
| Vite dev client | `http://127.0.0.1:5180/clients/tc-check/` (proxies `/api` to the rig) |

tC4 uses 19998, and 19990/5190 for its worktrees, so the lanes never collide. The rig
shares tC4's `dev-env/state/work`: do not run both rigs at the same time.

## Start the rig

Build and seed tC4's rig once (its `dev-env/README.md`), then, from tC4's
`dev-env/server` directory (Rocket reads `Rocket.toml` from the working directory):

```bash
APP_RESOURCES_DIR="<tc4>/dev-env/app-resources/" ROCKET_PORT=19980 ROCKET_ADDRESS=127.0.0.1 \
  ./target/release/tc4_dev_server.exe "<tc4>/dev-env/state/work/"
```

Check it: `curl http://127.0.0.1:19980/api/version` names `pkg_version` `0.18.15`.

## Run the journeys

```bash
npm run journeys
```

Playwright starts Vite itself. A journey whose prerequisite is missing skips and names it.
