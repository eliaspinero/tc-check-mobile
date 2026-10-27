# Instructions for AI agents

tc-check-mobile runs translationCore 4 (tC4) checks on a phone. Read the spec and plan in
`docs/superpowers/` before you change anything.

## Rules

- The Pankosmia server pin equals tC4's pin: `pankosmia_web` `0.18.15`. It moves when tC4's moves.
- The client is served at `/clients/tc-check`. Every server route is under `/api`.
- The Door43 server is `https://qa.door43.org` in a development build and
  `https://git.door43.org` otherwise. The build chooses, never the user.
- The Door43 token never goes to `localStorage`, a URL, or a log.
- No `pankosmia-rcl` visual component. Its contexts only.
- Screens reach checking logic only through `client/src/engine/` (ESLint enforces it), and
  projects only through `client/src/project/`.
- Every file in `client/src/checking/` is copied from tC4 and starts with
  `// Copied from unfoldingWord/translationCore4 <path> at <commit>. Changes: <list or "none">.`
  (`npm run check:provenance` enforces it). Copied code is updated by hand from that header.
- Slice 1 is read only: no route that writes to a project.

## Tests

- The Playwright journeys in `e2e/` are the main test method (`npm run journeys`).
- A journey whose prerequisite is missing skips and names the prerequisite. Do not invent
  the missing data, and do not report a skip as a defect.
- Do not write a unit test after the code. If you must test a part in isolation, write
  down all the ways it can fail first.

## Work

- Repository text (code, docs, commits, pull requests) is in English.
- Branches are `issue-<number>-<slug>`. Every change lands through a pull request.
- Ask the owner before any commit, push or pull request. Never merge.
