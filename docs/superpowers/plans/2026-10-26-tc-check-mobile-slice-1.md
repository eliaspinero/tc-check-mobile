# tc-check-mobile Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Android app that signs in to Door43, clones a tC4 project, installs its pinned resources, and shows tN and tW checks read-only with a swipeable check screen.

**Architecture:** A Tauri shell runs `pankosmia-web` on the phone and opens our React client at `/clients/tc-check`. The client reaches projects only through `ProjectSource`. Checking logic is copied from tC4 with provenance headers.

**Tech Stack:** Rust + Tauri 2 (shell only), `pankosmia_web` 0.18.15, React 18 + Vite + TypeScript, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-26-tc-check-mobile-slice-1-design.md`

## Global Constraints

- `pankosmia_web` pin = tC4's pin: `0.18.15` (tC4 `dev-env/README.md`).
- Client served at `/clients/tc-check`; `product.json` `homepage` = `tc-check`.
- Door43 server: `https://qa.door43.org` in a dev build, `https://git.door43.org` otherwise (copy tC4 `dcsServer.ts` rule: `env.DEV === true`).
- Token name minted on the account: `tc-check-mobile`. Scopes: `write:repository`, `write:organization`, `write:user` (tC4 `TOKEN_SCOPES`).
- The token never goes to `localStorage`, a URL, or a log.
- No `pankosmia-rcl` visual component. Its contexts only.
- Screens (`client/src/screens/`) import checking logic only from `client/src/engine/`, never from `client/src/checking/` (enforced by ESLint, Task 2).
- Every file in `client/src/checking/` starts with `// Copied from unfoldingWord/translationCore4 <path> at <commit>. Changes: <list or "none">.`
- Read only: no route that writes to a project is called in slice 1.
- Tests: Playwright journeys are the main method. A journey that lacks a prerequisite skips and names it. No unit test written after the code.
- Repo text (code, docs, commits, PRs) in English. Work on branch `issue-<n>-<slug>`; ask Elias before every commit, push or PR.

## Review Focus

1. A Door43 repo that is not a tC4 project (no `ingredients/checking/resources.json`) is picked: the app says so and offers to go back. Test in Task 5.
2. A project already cloned on the phone is picked again: the app opens the local copy, no second clone, no error. Test in Task 5.
3. The network drops during a resource download: no half-installed resource stays; the next try installs it. Test in Task 6.
4. Swipe at the first or last check: the position stays, no wrap-around. Test in Task 8.
5. A right-to-left target language (Arabic): the target verse renders `dir="rtl"` and its selection highlight sits on the right words. Test in Task 8.

---

### Task 1: Client scaffold, rig lane and first journey

**Files:**
- Create: `client/package.json`, `client/vite.config.ts`, `client/tsconfig.json`, `client/index.html`, `client/src/main.tsx`, `client/src/App.tsx`
- Create: `e2e/playwright.config.ts`, `e2e/helpers/rig.ts`, `e2e/j0-boot.spec.ts`
- Create: `AGENTS.md`, `CLAUDE.md` (one line: read AGENTS.md)
- Create: `dev-env/README.md`

**Interfaces:**
- Produces: `RIG_URL` (`http://127.0.0.1:19980`) and `CLIENT_URL` (`http://127.0.0.1:5180`) exported from `e2e/helpers/rig.ts`; `rigUp(): Promise<boolean>`.

- [ ] **Step 1: Write `dev-env/README.md`.** Start the rig with tC4's `dev-env` (pankosmia-web 0.18.15) on port `19980`, the tc-check lane, so it never collides with tC4's 19998/19990. Vite dev on `5180` proxies `/burrito`, `/git`, `/gitea`, `/content-utils`, `/settings`, `/net` to the rig.
- [ ] **Step 2: Write journey `j0-boot`**: skips with "needs the pankosmia rig on 19980" when `rigUp()` is false; else opens `CLIENT_URL` and expects text `Sign in to Door43`.
- [ ] **Step 3: Run** `npx playwright test e2e/j0-boot.spec.ts`. Expected: FAIL (no client).
- [ ] **Step 4: Scaffold the client**: Vite base `/clients/tc-check/`, dev port 5180, proxy above; `App` renders a heading `Sign in to Door43`.
- [ ] **Step 5: Run** the journey. Expected: PASS.
- [ ] **Step 6: Write `AGENTS.md`**: the Global Constraints above, plus "copied code is updated by hand from its provenance header".
- [ ] **Step 7: Commit** (ask first): `chore: scaffold client, rig lane and boot journey`.

### Task 2: Copied tC4 checking code behind CheckingEngine

**Files:**
- Create: `client/src/checking/derive.ts`, `sourceHighlight.ts`, `selections.ts`, `resolve.ts`, `versification.ts` (only what `derive` needs), `scripts/check-provenance.mjs`
- Create: `client/src/engine/CheckingEngine.ts` (interface), `client/src/engine/tsEngine.ts` (over the copied code), `client/eslint.config.js`
- Modify: `client/package.json` (add `usfm-js` 3.4.3, `proskomma-core` 0.11.3, `bible-reference-range` 1.1.1, `string-punctuation-tokenizer` 2.0.0 at tC4's exact versions; scripts `check:provenance`, `lint`)

**Interfaces:**
- Internal (copied, used only by `tsEngine`): `deriveForProject`, `progressOf`, `tokenizeVerse`, `matchQuote`, `tokenIndicesFromSelections`, `resolveToolBook` — signatures exactly as in tC4 at the copied commit.
- Produces:
```ts
interface CheckingEngine {
  resolve(resources: ResourcesFile, tool: Tool, book: string): Resolution;   // state + pin
  deriveItems(input: DeriveInput): { items: CheckItem[]; dropped: { count: number; scheme: string } | null };
  progress(items: CheckItem[]): { decided: number; total: number };
  sourceTokens(verseUsfmJson: unknown, quote: string | TnQuoteWord[], occurrence: number): { tokens: SourceToken[]; highlighted: number[] };
  targetTokens(targetVerseText: string, selections: Selection[] | false): { tokens: string[]; selected: number[] };
}
```
`DeriveInput = { tsv: string; tool: Tool; book: string; originalBookUsfm: string; decisions: DecisionFile | null; scope: string[]; vrs: unknown }`. `Resolution = { state: 'ready'|'unavailable'|'unpinned'|'not-covered'|'old-twl'; pin: ResourcePin | null }`. `tsEngine: CheckingEngine` is the only implementation in slice 1.

- [ ] **Step 1: Write `scripts/check-provenance.mjs`**: fails, naming the file, when any `client/src/checking/*.ts` lacks the header of Global Constraints, or names a tC4 path that does not exist at that commit (`git -C <tc4> cat-file -e <commit>:<path>`; skip that half with a message when no tC4 checkout is given in `TC4_DIR`).
- [ ] **Step 2: Negative control**: copy one file without the header; run `npm run check:provenance`. Expected: FAIL naming it.
- [ ] **Step 3: Copy the files** from tC4 `main` (record the commit). Cut imports of app-only modules (`i18n`, `import.meta.env`, stores); list each cut under `Changes:`.
- [ ] **Step 4: Write `tsEngine`** over the copied functions, and an ESLint `no-restricted-imports` rule for `client/src/screens/**` that forbids `**/checking/**` with the message `Use CheckingEngine from src/engine instead`.
- [ ] **Step 5: Negative control**: add `import { matchQuote } from '../checking/sourceHighlight'` to a file under `screens/`; run `npm run lint`. Expected: FAIL with that message. Remove it.
- [ ] **Step 6: Run** `npm run check:provenance`, `npm run lint` and `npx tsc --noEmit`. Expected: all pass.
- [ ] **Step 7: Commit** (ask first): `feat: copy tC4 checking functions behind CheckingEngine`.

### Task 3: ProjectSource over pankosmia-web

**Files:**
- Create: `client/src/project/ProjectSource.ts` (interface), `client/src/project/pankosmiaSource.ts`, `client/src/project/http.ts`

**Interfaces:**
- Produces:
```ts
interface ProjectSource {
  listRemote(server: string, org: string): Promise<RemoteProject[]>;
  listLocal(): Promise<string[]>;                       // repoPaths
  clone(host: string, org: string, repo: string): Promise<string>; // repoPath
  pull(repoPath: string): Promise<void>;                 // remote 'origin'
  readText(repoPath: string, ipath: string): Promise<string>;
  readResources(repoPath: string): Promise<ResourcesFile | null>; // null = not a tC4 project
  readDecisions(repoPath: string, tool: Tool, book: string): Promise<DecisionFile | null>;
  installResourceZip(localRepoPath: string, zip: Uint8Array): Promise<void>;
  isInstalled(localRepoPath: string): Promise<boolean>;
}
```
`RemoteProject = { host, org, repo, description }`. `ResourcesFile`, `DecisionFile`, `Tool` copied from tC4 `burritoStore.ts` types (provenance header).
- Routes: as in the spec §3.3 table.

- [ ] **Step 1: Implement** `pankosmiaSource` with `fetch` against relative routes; a non-2xx throws `ServerError { route, status, message }` with the server's text, never the request body.
- [ ] **Step 2: Verify** with `npx tsc --noEmit`. Expected: pass. (Behavior is proven by the journeys of Tasks 5 to 9.)
- [ ] **Step 3: Commit** (ask first): `feat: ProjectSource over pankosmia-web`.

### Task 4: Door43 sign-in

**Files:**
- Create: `client/src/door43/door43Api.ts` (copied, provenance), `client/src/door43/dcsServer.ts` (copied), `client/src/door43/tokenStore.ts`, `client/src/screens/SignIn.tsx`
- Create: `e2e/j1-signin-clone.spec.ts`

**Interfaces:**
- Produces: `interface TokenStore { keep(t: string): Promise<void>; read(): Promise<string|null>; forget(): Promise<void> }`; `memoryTokenStore` (browser and journeys); `Door43Session = { username, token }`; `signIn(login, password, store) → Door43Session`.
- Task 10 adds `tauriTokenStore`.

- [ ] **Step 1: Write journey `j1` part 1**: skips with "needs TC_QA_USER and TC_QA_PASSWORD" when absent; signs in; expects the project list heading `Your projects`. Wrong password expects Door43's message text on screen.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** sign-in: copy tC4's mint flow (delete an old `tc-check-mobile` token, mint a new one); keep the token in the `TokenStore`; the password leaves memory after minting.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** (ask first): `feat: Door43 sign-in`.

### Task 5: Project list and clone

**Files:**
- Create: `client/src/screens/ProjectList.tsx`
- Modify: `e2e/j1-signin-clone.spec.ts`

**Interfaces:**
- Consumes: `ProjectSource.listRemote/listLocal/clone/readResources`, `Door43Session`.
- Produces: route state `{ screen: 'books', repoPath }`.

- [ ] **Step 1: Extend `j1`**: needs `TC_QA_PROJECT` (`org/repo` of a tC4 project on QA) else skips naming it. Picks it; expects the book picker. Then:
  - Review Focus 2: back, pick it again; expects the book picker and `listLocal()` holds the repoPath once.
  - Review Focus 1: needs `TC_QA_PLAIN_REPO` (a repo without `resources.json`); picks it; expects `This isn't a translationCore project` and a `Back` button.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**: list the user's repos and each org's (`GET /api/v1/user/orgs`); a project already in `listLocal()` opens without cloning; after clone, `readResources` null shows the message above.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** (ask first): `feat: project list and clone`.

### Task 6: Install pinned resources

**Files:**
- Create: `client/src/resources/installPins.ts` (from tC4 `resourceFetch.ts`, provenance), `client/src/screens/ResourceInstall.tsx`
- Create: `e2e/j2-resources.spec.ts`, `e2e/j5-offline.spec.ts`

**Interfaces:**
- Consumes: `ProjectSource.readResources/isInstalled/installResourceZip`.
- Produces: `missingPins(resources, source) → ResourcePin[]`; `installPin(pin, source, onProgress) → Promise<void>` (fetch sb-zip of the tag, verify declared revision against `pin.sha`, unwrap, install under `_local_/_sideloaded_/`).

- [ ] **Step 1: Write `j2`**: with `TC_QA_PROJECT` cloned, opens it; expects a progress row per missing pin, then the book picker; a second open shows no install step.
- [ ] **Step 2: Write `j2` Review Focus 3**: abort the first zip request with `page.route` after headers; expects `Download stopped. Try again`, `isInstalled` false for that pin; retry installs it.
- [ ] **Step 3: Write `j5`**: a pin missing and the network off (`context.setOffline(true)`); expects the unavailable state text copied from tC4 `check.unavailable` (English string), not an error.
- [ ] **Step 4: Run.** Expected: FAIL.
- [ ] **Step 5: Implement.** A sha mismatch refuses the install and shows the pin and both shas.
- [ ] **Step 6: Run** `j2` and `j5`. Expected: PASS.
- [ ] **Step 7: Commit** (ask first): `feat: install pinned resources`.

### Task 7: Book, tool and check list

**Files:**
- Create: `client/src/screens/BookPicker.tsx`, `client/src/screens/CheckList.tsx`, `client/src/session/loadSession.ts` (our code, so outside `checking/`)
- Create: `e2e/j3-check.spec.ts`

**Interfaces:**
- Consumes: `CheckingEngine.resolve/deriveItems/progress`, `ProjectSource.readText/readDecisions`.
- Produces: `loadSession(repoPath, tool, book) → { items: CheckItem[], dropped: {count, scheme} | null, progress: {decided,total}, state: 'ready'|'unavailable'|'unpinned'|'not-covered'|'old-twl' }`.

- [ ] **Step 1: Write `j3` part 1**: opens TIT, tW; expects the progress `decided / total` equal to `engine.progress` over the derived list (journey reads both from the page and from a test hook `window.__tcCheck.session`); expects the dropped-count line when `dropped` is not null.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**: the book picker lists `currentScope` books; tool tN or tW; states copied from tC4 `Check.jsx` (English strings).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** (ask first): `feat: book picker and check list`.

### Task 8: Check screen and swipe

**Files:**
- Create: `client/src/screens/CheckScreen.tsx`, `client/src/screens/useSwipe.ts`, `client/src/screens/check.css`
- Modify: `e2e/j3-check.spec.ts`; create `e2e/j4-swipe.spec.ts`

**Interfaces:**
- Consumes: `loadSession`, `CheckingEngine.sourceTokens/targetTokens`.
- Produces: `useSwipe(onNext, onPrev)` — horizontal pointer move over 60 px and more horizontal than vertical.

- [ ] **Step 1: Extend `j3`**: open the first check; expect header `TIT 1:1 · tW · 1 / <total>`; help title visible; ULT and UST each show the full verse with `[data-hl]` tokens equal to `sourceTokens(...).highlighted`; target verse shows `[data-sel]` on the stored selection.
- [ ] **Step 2: Write `j4`**: swipe left → `2 / <total>`; swipe right → `1 / <total>`; Review Focus 4: swipe right at 1 stays `1`, swipe left at the last stays last.
- [ ] **Step 3: Write `j4` Review Focus 5**: needs `TC_QA_RTL_PROJECT` (an Arabic tC4 project) else skips naming it; expects the target verse `dir="rtl"` and the `[data-sel]` word text equal to the stored selection text.
- [ ] **Step 4: Run.** Expected: FAIL.
- [ ] **Step 5: Implement** the layout of spec §5 (help, ULT, UST, target; no action row). Target `dir` from the project's language direction in `metadata.json`.
- [ ] **Step 6: Run** `j3` and `j4`. Expected: PASS.
- [ ] **Step 7: Commit** (ask first): `feat: check screen and swipe`.

### Task 9: Sync (pull only)

**Files:**
- Modify: `client/src/screens/CheckList.tsx`
- Modify: `e2e/j1-signin-clone.spec.ts`

- [ ] **Step 1: Extend `j1`**: needs `TC_QA_TOKEN_PUSH` (a QA token allowed to push to `TC_QA_PROJECT`) else skips naming it. The journey commits a new decision file change to Door43 main through the API, taps `Sync`; expects the list's `decided` to rise by one.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**: `Sync` calls `ProjectSource.pull(repoPath)` and reloads the session. Offline shows `You're offline`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** (ask first): `feat: sync pulls Door43 main`.

### Task 10: Android shell

**Files:**
- Create: `shell/` from `pankosmia/mobile-app-template` (record its commit in `shell/README.md`)
- Modify: `shell/src-tauri/Cargo.toml` (`pankosmia_web = "=0.18.15"`), `shell/src-tauri/pankosmia_resources/.../product.json` (`homepage: tc-check`), `shell/src/App.jsx` (open `/clients/tc-check`)
- Create: `client/src/door43/tauriTokenStore.ts`, `scripts/build-client-into-shell.mjs`

**Interfaces:**
- Produces: `tauriTokenStore: TokenStore` over the OS keychain plugin (`tauri-plugin-keychain` 2.0.2 if it builds for Android; else `tauri-plugin-stronghold` with the key in Android Keystore). The client picks it when `window.__TAURI__` exists.

- [ ] **Step 1: Fork** the template; drop clients the app does not need, keep `resource-core` and `webfonts-core`; build our client into `pankosmia_resources/lib/clients/tc-check`.
- [ ] **Step 2: Build** `npm run android:tauri -- android build --apk`. Expected: an APK under `shell/src-tauri/gen/android/.../release`.
- [ ] **Step 3: Verify by hand** on an Android emulator and one phone, against QA: sign in, clone `TC_QA_PROJECT`, install resources, open TIT tW, swipe. Record server start time on the phone (spec §9). Paste screenshots and the time in the PR.
- [ ] **Step 4: Verify the token**: after sign-in, `adb shell run-as <pkg> grep -r <last 8 of token> .` finds nothing outside the keychain store.
- [ ] **Step 5: Commit** (ask first): `feat: Android shell with pankosmia-web 0.18.15`.

---

## Done (spec §8)

- APK installs, signs in on QA, clones, installs resources, shows tN and tW checks per spec §5 (Task 10 Step 3).
- Journeys `j0` to `j5` pass; their output is pasted in the PR.
