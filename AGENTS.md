# Instructions for AI agents

tc-check-mobile runs translationCore 4 (tC4) checks on a phone. Read the spec and plan in
`docs/superpowers/` before you change anything.

## Rules

- The Pankosmia server pin is `pankosmia_web` `0.18.15`, the same in `shell/src-tauri` and the
  journeys' rig `dev-env/rig` (`j35` checks it). It moves only through an issue.
- The client is served at `/clients/tc-check`. Every server route is under `/api`.
- The Door43 server is `https://qa.door43.org` in a development build and
  `https://git.door43.org` otherwise. The build chooses, never the user.
- The Door43 token never goes to `localStorage`, a URL, or a log.
- No `pankosmia-rcl` visual component. Its contexts only.
- Screens reach checking logic only through `client/src/engine/` (ESLint enforces it), and
  projects only through `client/src/project/`.
- Every file in `client/src/checking/` is copied from tC4 and starts with
  `// Copied from unfoldingWord/translationCore4 <path> at <commit>. Changes: <list or "none">.`
  So does every stylesheet in `client/src/ds/` (tC4's design tokens), with the same line in `/* */`
  (`npm run check:provenance` enforces both). Copied code is updated by hand from that header.
- Enter, leave and state changes are animated in CSS (and screen changes with the View Transitions
  API) with tC4's motion tokens (`client/src/ds/tokens/motion.css`): only `transform` and `opacity`,
  no bounce, spring or scale-on-press, and nothing moves under `prefers-reduced-motion: reduce`. Only
  an animation that follows a finger may use a library, and its issue decides that. `e2e/j30-motion.spec.ts` rejects an
  animated property other than `transform`/`opacity`, a typed duration or easing, and an animation library.
- A decision is written only through the project's journal, as tC4 writes it
  (`client/src/session/journal.ts`): the sealed segment first, then the derived file. Nothing else
  writes to a project.

## Tests

- The Playwright journeys in `e2e/` are the main test method (`npm run journeys`).
- A journey whose prerequisite is missing skips and names the prerequisite. Do not invent
  the missing data, and do not report a skip as a defect.
- Do not write a unit test after the code. If you must test a part in isolation, write
  down all the ways it can fail first.

## Work

- Repository text (code, docs, commits, pull requests) is in English.
- When an issue needs another issue done first, record it as a GitHub issue dependency ("Blocked
  by" in the issue's Relationships), not only as text in the body. It is the one record of what
  blocks what: `gh api repos/eliaspinero/tc-check-mobile/issues/<n>/dependencies/blocked_by` lists
  an issue's blockers.
- Before starting an issue, check its blockers. If one is still open, say so and do not start
  unless the owner says to.
- Branches are `issue-<number>-<slug>`. Every change lands through a pull request.
- Ask the owner before any commit, push or pull request. Never merge.
- Before writing a helper, look for one that already does it (`graft grep` and `graft callers`, or
  ripgrep where graft is absent) and reuse or extend it instead of adding a second one.
- A flow's loading, running and failure live in one closed state (`Load<T>` or `Run<R>` in
  `client/src/screens/load.ts`); ESLint catches the usual flags. A toggle that is only about the
  interface (a dialog open, a confirm armed) stays its own boolean. Any other new boolean next to a
  flow's state is justified in the pull request.
- A flow with many steps and ways back (for example slice 2's write and two-way sync, #9) decides in
  its plan whether a state machine library such as XState is worth it, or `Load`/`Run` are enough.
- Before the pull request, review the branch's diff for code to reuse and to simplify, and apply what
  it finds (in Claude Code: `/simplify`).

<!-- graft:start -->
## Graft — repo context graph

`graft/` holds small linked markdown nodes that explain each system and carry
exact file:line spans. It is a LOCAL cache: gitignored and regenerable with
`graft build`, so it is ABSENT in a fresh clone and in CI.

**Check first.** If `graft` is on PATH and `graft/` exists, prefer it — it is
faster and cheaper than grepping. If either is missing, that is the normal state
of a fresh clone, not a fault to report or work around: use ripgrep and read the
files directly, and treat nothing in this section as a prerequisite. Never
`npm install graft` to satisfy this section — the npm package of that name is
unrelated software.

When the graph is present: for understanding how something works, finding where
code lives, or scoping a change, get context from it before grepping. Re-ask
freely (it's cheap) and reuse literal identifiers you already have (symbol,
error string, file name) as the query. New to this repo? Run `graft map` first —
a token-budgeted orientation (dir clusters, hubs, hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. While the graph is present, prefer a node's file:line
pointer over re-reading a whole file; when it is absent, read what you need.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
