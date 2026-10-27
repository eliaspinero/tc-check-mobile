# tc-check-mobile — Slice 1 design: read and navigate

**Date:** 2026-10-26
**Status:** Draft for review
**Author:** Elias Piñero, with Claude

## 1. Goal

A team checker who has no laptop runs translationCore 4 (tC4) checks on a phone.
The checker downloads a project from Door43, checks offline, and syncs. The
decisions appear in tC4 desktop after its next sync.

The whole product is built in slices. This document designs **slice 1 only**.

| Slice | Content |
|---|---|
| 1 (this spec) | Sign in to Door43, open a project, install its pinned resources, list translationNotes (tN) and translationWords (tW) checks, show the check screen, swipe between checks. Read only. |
| 2 | Select target words, mark a check valid or invalid, write the journal, sync to Door43. |
| 3 | Store release: signing, Play Store, then iOS. |

Out of scope for every slice so far: the word aligner, drafting, publishing,
OBS projects.

## 2. Decisions taken in brainstorming

1. **Pankosmia on the phone.** The app is a Tauri mobile app that runs the
   `pankosmia-web` server (Rust) on `127.0.0.1`, as
   [`pankosmia/mobile-app-template`](https://github.com/pankosmia/mobile-app-template)
   does. A project is a real git repository on the phone. Clone, pull, push,
   the Door43 proxy and the `metadata.json` stamp are the server's work, as on
   desktop. Slice 2 can then follow tC4's sync rules (BURRITO-SPEC §8.7) with
   the phone as its own journal actor.
2. **Rust only in the shell.** Our own Rust is the Tauri shell. Checking logic
   stays in TypeScript in the client, like tC4.
3. **Reuse without importing.** The client uses the non-visual contexts of
   `pankosmia-rcl` only (net, i18n, current project), as tC4 decision D29 does.
   Pure functions from tC4 are copied into this repository with a provenance
   header (source path and tC4 commit). Nothing from tC4 is a dependency.
4. **The project format may change.** tC4 is being rebuilt. All project access
   goes through one interface in `client/src/project/`. A format change touches
   that folder only.
5. **Android first.** The Pankosmia template is proven on Android. iOS is an
   open risk (section 9).
6. **Check screen.** Layout C from the mockups, with both source texts in full
   (section 5).
7. **Swipe** moves to the next or previous check in the list, also within one
   verse.
8. **tC4 is being rebuilt in Rust, all of it** (Elias, 2026-10-26; not public
   yet). Slice 1 keeps a React UI. Screens reach checking logic only through a
   `CheckingEngine` interface, and projects only through `ProjectSource`. When
   tC4's Rust crates exist, a second `CheckingEngine` calls them through Tauri
   commands, and the screens do not change. The UI framework is decided again
   when tC4's is known.

## 3. Architecture

```
tc-check-mobile/
  shell/          Tauri app (Rust). Starts pankosmia-web, opens the client.
  client/         React + Vite. Served by the local server at /clients/tc-check.
    src/project/  ProjectSource interface and its pankosmia-web implementation.
    src/checking/ Copied tC4 functions: derive, sourceHighlight, selections, resolve.
    src/screens/  Sign-in, project list, book and tool picker, check list, check screen.
  e2e/            Playwright journeys.
  docs/           Specs and decisions.
  AGENTS.md       Working rules for agents.
```

### 3.1 Shell

- Forked from `pankosmia/mobile-app-template`.
- Pins `pankosmia_web` to the version tC4 pins (0.18.15 on 2026-10-26).
  The pin moves when tC4's pin moves.
- Embeds `resource-core` and `webfonts-core` like the desktop template, and our
  built client under `clients/tc-check`. `product.json` `homepage` is
  `tc-check`.
- Keeps the Door43 token in the operating system's secure storage through a
  Tauri plugin. The token never goes to `localStorage`, a URL, or a log.

### 3.2 Client

Own UI, built for one thumb. No `pankosmia-rcl` visual component.

### 3.3 ProjectSource

The only module that talks to the server about projects.

| Operation | pankosmia-web route used by tC4 today |
|---|---|
| List remote projects | `GET /gitea/remote-repos/<server>/<org>` |
| Clone a project | `POST /git/clone-repo/<host>/<org>/<repo>` |
| Pull Door43 main | `POST /git/pull-repo/<remote>/<repo>` |
| List local projects | `GET /git/list-local-repos` |
| Read a file | `GET /burrito/ingredient/raw/<repo>?ipath=` |
| Read metadata | `GET /burrito/metadata/raw/<repo>` |
| Install a resource zip | `POST /burrito/zipped/<repo>` |

Slice 1 calls only read routes plus clone, pull and resource install.

### 3.4 Copied tC4 code

| tC4 source | Purpose here |
|---|---|
| `src/data/derive.ts` | TSV to check items, merge with stored decisions, scope filter, progress |
| `src/data/sourceHighlight.ts` | Tokenize aligned ULT/UST, find the quote's words |
| `src/data/selections.ts` | Show stored selections on the target verse |
| `src/data/resolve.ts` | (tool, book) resolution over the two language sets |
| `src/data/resourceFetch.ts` | Fetch the pinned sb-zip, verify the sha, unwrap, install |
| `src/data/share/door43Api.ts` | Sign-in and token minting |

Each copied file starts with:
`// Copied from unfoldingWord/translationCore4 <path> at <commit>. Changes: <list or "none">.`

## 4. Slice 1 flow

1. The checker opens the app. The shell waits for the local server, then shows
   the client.
2. **Sign in** to Door43 with username and password. The app mints its own
   token on the account, as tC4 does, and keeps only the token.
3. **Project list**: the checker's own Door43 projects and those of their
   organizations. The checker picks one. The server clones it. From here the
   project works offline.
4. **Resources**: the app reads `ingredients/checking/resources.json` and
   installs each pinned resource that is missing: the sb-zip of the exact tag,
   verified against the pinned sha. A full English set (ULT, UST, tN, TWL, tW,
   UGNT, UHB) is about 32 MB.
5. **Book and tool**: the checker picks a book and tN or tW.
6. **Check list**: derived from the pinned TSV and the original-language book,
   merged with the stored decisions, filtered to the project's scope. The list
   shows progress (decided / total). Checks dropped by versification are
   counted and shown.
7. **Check screen** (section 5). Swipe moves between checks.
8. **Sync** button: in slice 1 it pulls Door43 main and reloads. It writes
   nothing.

The target verse shown is the USFM of the cloned repository. That is correct
in slice 1, because the project arrives as a pushed checkpoint and the phone
writes nothing. Slice 2 switches to the fold's projection, like tC4.

## 5. Check screen

From top to bottom:

1. Header: reference, tool, position in the list (`TIT 1:1 · tW · 12 / 48`).
2. The help: tW article title and its first lines, or the tN note. Tapping it
   opens the full text.
3. ULT, the full verse, with the quote highlighted.
4. UST, the full verse, with the quote highlighted.
5. Target verse, larger type, with the stored selection highlighted.
6. Slice 2 only: Valid and Invalid buttons at the bottom, in thumb reach.
   In slice 1 this row is absent.

Swipe left: next check. Swipe right: previous check. The list order is the
tC4 order.

## 6. Errors

- The "cannot check" states are tC4's (`Check.jsx`, from `resolve.ts`):
  resource missing and offline (a normal state, not an error), no pins, book
  not covered by either language set, old one-repo tW pin.
- A failed sign-in or clone shows Door43's own message.
- Nothing is hidden: dropped checks are counted on the list.

## 7. Testing

Following the tC4 rules the owner set:

- Playwright journeys in `e2e/` are the main method. They run the client
  against a `pankosmia-web` rig on the PC (from tC4's `dev-env/`) and a project
  on the Door43 QA server. Each journey ends with an artifact that each run
  produces again in the same way.
- Slice 1 journeys:
  1. Sign in, list projects, clone one.
  2. Install the pinned resources of a project.
  3. Open TIT tW, see the list count, open the first check, see the quote
     highlighted in ULT and UST and the selection in the target verse.
  4. Swipe forward and back; the header position changes.
  5. Offline with a missing resource shows the unavailable state.
- The shell is checked by hand on an Android emulator and one real phone.
- No unit test written after the code. A part tested in isolation lists its
  failure modes first.

## 8. Done when

- An APK installs on an Android phone, signs in to the Door43 QA server, clones
  a tC4 project, installs its resources, and shows tN and tW checks with the
  check screen of section 5.
- Journeys 1 to 5 pass and their output is pasted in the pull request.

## 9. Risks and open points

| Risk | Note |
|---|---|
| iOS | Tauri iOS builds need a Mac and an Apple account; OpenSSL for iOS is unproven in the template. Decided in slice 3. |
| Server version drift | The template pins 0.18.7, tC4 0.18.15, crates.io has 0.20.3. We follow tC4. |
| tC4 rebuild in Rust | The project format and the checking logic may change, and tC4's UI framework is not known yet. Contained by `ProjectSource` and `CheckingEngine`; the React screens are the only part to rewrite if we follow tC4's UI framework. |
| Phone storage | About 32 MB per language set, plus the project. Acceptable for slice 1. |
| Server start time | The template waits up to 20 s for the server. Measure on a mid-range phone. |
