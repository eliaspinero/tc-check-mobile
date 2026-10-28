# Issue 3: interface and navigation — plan

Issue: eliaspinero/tc-check-mobile#3. One pull request, branch `issue-3-interface`, from main 5ae8c62.
Slice 2 (Valid/Invalid, selection, writing decisions) is out of scope.

## Criteria (the issue's "Decided by the owner" list, one criterion each)

1. **Top bar** on every screen: a back arrow and the place you are in. No "Back" buttons at the bottom.
2. **Chapter selector on the title**: tapping `Tito 1 ▾` opens a grid of the book's chapters, on the check list and on the check screen. On the check screen a chapter goes to its first check.
3. **Check list**: one chapter at a time, an accordion per verse with checks, each with its progress (`1:2 · 1 of 4`); opened, it lists the checks by word or note category; the verse of the current check opens by itself; a line above gives the chapter's progress.
4. **Check screen**: collapsible help (title and first line closed, all open); ULT and UST in full with the quote highlighted; the target marked as the target; Previous and Next in a bottom bar; swipe still works.
5. **Markdown in the helps** renders: bold, italics, headings, lists, links.
6. **Book picker**: book names instead of codes, "Words"/"Notes" (es: "Palabras"/"Notas") instead of tW/tN, each book's progress.
7. **Project list**: aligned titles, a readable name, a way to sign out.
8. **Interface in Spanish and English**: one strings file per language, the phone's language, English fallback.

Readings taken on gaps (also under Decisions in the pull request):

- Chapters with no checks show greyed and disabled in the grid. A chapter whose checks all have a stored decision gets a ✓.
- Next and swipe cross chapters: `session.items` is already the whole book in reference order, so they do today. The title follows the check.
- Progress = checks with a stored decision (`selections !== false`, what `session.progress.decided` counts today) over the total.
- Book names and chapter counts come from a fixed table per language (eng canon): the sample's `localizedNames` is empty, and tC4 also uses a fixed table (`src/data/bookNames.ts`, English only).
- Links render as their text, as tC4's `renderArticleBlocks` does (`[[rc://…]]` and `[text](url)` become the text). Following an rc link to another article is not in this issue.
- A readable name: the repo name stays as written on Door43 (what the checker knows and searches for) as the bold title, with owner and description on a second, muted line.

## Findings (main 5ae8c62)

- `client/src/screens/CheckList.tsx:79-96`: one flat list of every check of the book; "Back" at the bottom (`:98`).
- `client/src/screens/CheckScreen.tsx:56-83`: the tW body shows with `pre-line` and `#` stripped, so `**elegido**` shows raw; the tN note shows raw (`:69`). Only swipe moves (`:91-94`). The help toggles by a click on a `<p>`, which a keyboard or a screen reader cannot reach.
- `client/src/screens/BookPicker.tsx:28-37`: book codes, `tW`/`tN` buttons, no progress, "Back" at the bottom.
- `client/src/screens/ProjectList.tsx`: no sign-out; `TokenStore.forget` is called only on a 401/403 restore (`App.tsx:43`).
- Every string is an English literal in JSX; there is no i18n module.

## Approach (two ways compared)

- **Verse accordions.** (a) `<details>/<summary>` per verse; (b) `button aria-expanded` with React state. Both keep tap, keyboard and screen reader. (a) needs no state, and "the current verse opens by itself" is its `open` attribute. Chosen (a). Loses nothing.
- **Help collapse.** (a) `<details>` with the title and first block in the summary: the first block would show twice when open. (b) a real toggle button with `aria-expanded`; closed shows the first block clamped, open shows all blocks. Chosen (b). Gains keyboard and screen-reader reach; text stays selectable.
- **Strings.** (a) `client/src/i18n/` with `en.ts`, `es.ts` typed `Record<keyof typeof en, string>`, `t(key, vars)`, locale from `navigator.languages`; (b) react-intl or i18next: a download and more than needed. Chosen (a).
- **Markdown.** (a) copy tC4's `renderArticleBlocks` into `client/src/checking/markdown.ts` with the provenance header, reached through `engine.articleBlocks`; (b) a markdown library: a download, and HTML output that tC4 avoids. Chosen (a): same output as tC4.
- **Book progress.** (a) load each book × tool session in the background, one at a time, through `loadSession`, showing `…` until it answers; (b) progress only for books already opened, which leaves the criterion unmet. Chosen (a).
- **Sign out.** A "Sign out" button in the project list's top bar. The first tap turns it into "Tap again to sign out" for 4 s; the second calls `store.forget()` and shows sign-in. Two taps because signing out offline leaves the checker unable to sign in until online. No Door43 call, as tC4's `signOut`.

## Change by file

- `client/src/i18n/en.ts`, `es.ts`, `index.ts` (new): every screen string; `t(key, vars?)`; locale = first of `navigator.languages` starting `es` → `es`, else `en`; sets `document.documentElement.lang`.
- `client/src/i18n/books.ts` (new): the 66 books (eng canon) with chapter count and en/es names; `bookName(code)`, `chapterCount(code)`, `toolName(tool)`.
- `client/src/checking/markdown.ts` (new, copied): `ArticleSpan`, `ArticleBlock`, `renderArticleBlocks` from tC4 `src/data/articles.ts` at b1911407. "Changes: only the markdown rendering is copied; the article readers are not."
- `client/src/engine/CheckingEngine.ts`, `tsEngine.ts`: `articleBlocks(markdown: string): ArticleBlock[]`.
- `client/src/screens/TopBar.tsx` (new): `TopBar({ title, onBack?, onTitle?, sub?, actions? })`; back is an arrow button named t('back').
- `client/src/screens/ChapterGrid.tsx` (new): a dialog (`role="dialog"`, close button, Escape) of chapter buttons; disabled with no checks, ✓ when all are decided.
- `client/src/screens/Markdown.tsx` (new): `ArticleBlock[]` → `h3/h4`, `p`, `ul/li`, `blockquote`, `strong/em`.
- `client/src/screens/CheckList.tsx`: top bar `Titus 1 ▾` + Sync; chapter progress line (`data-testid="chapter-progress"`); `<details data-testid="verse">` per verse with checks; check rows (`data-testid="check-row"`) inside; `focus` prop opens the chapter and verse of the check the checker came back from. Book progress (`data-testid="progress"`) stays.
- `client/src/screens/CheckScreen.tsx`: top bar `Titus 1:2 ▾` with sub `Words · 3 / 40` (`data-testid="check-header"`); collapsible help with rendered markdown (tW article and tN note); target pane labelled "Your translation" (es "Tu traducción"); bottom bar Previous / Next; swipe kept; grid → first check of the chapter.
- `client/src/screens/BookPicker.tsx`, `ProjectList.tsx`, `SignIn.tsx`, `ResourceInstall.tsx`, `App.tsx`: top bar, strings, names and progress, sign-out; App passes the check index back to the list as `focus`.
- `client/src/app.css`: top bar, bottom bar, accordions, grid dialog, rows, help.
- `eslint.config.js`: `no-restricted-syntax` on `client/src/screens/**` and `App.tsx` for JSX text with a letter and for literal `aria-label`/`placeholder`/`title`, message "Put user-facing text in client/src/i18n and use t()".
- `e2e/*`: selectors follow the new screens (the back arrow keeps the name "Back"; book buttons are named `Titus Words`); new `e2e/j9-interface.spec.ts`.

## Proof per criterion (every j9 journey fails today: none of these elements exist)

| # | Journey in `e2e/j9-interface.spec.ts` |
|---|---|
| 1 | every screen has a top bar with Back, and no Back button at the bottom |
| 2 | the chapter grid on the list switches chapter; on the check screen it goes to that chapter's first check; a chapter with no checks is disabled (which one: picked from the sample when written — unverified) |
| 3 | the list shows one chapter as verse accordions with progress, and coming back from a check opens its verse |
| 4 | Previous and Next move, cross a chapter and stop at the ends; the help opens and closes with its button (swipe: j4 kept) |
| 5 | tW and tN helps render bold and lists, with no `**` or `#` left |
| 6 | the book picker shows names, Words and Notes, and each book's progress |
| 7 | sign out takes a second tap, then shows sign-in; a reload stays signed out |
| 8 | with a Spanish phone (`locale: 'es-419'`) the screens read Tito, Palabras, Atrás; otherwise English. And `npm run typecheck` fails when `es.ts` lacks a key (seen once). |

## Risks

- j1–j8 select by English text and the flat list: updated in the same change; the whole suite runs (rig 19980, Vite 5180).
- `<details>` in the Android WebView: supported for years; checked in the Pixel 7 Playwright profile, not on a phone.
- Book progress derives every book once: a large project fills in slowly, never blocking a tap.
- The APK workflow builds the client on the pull request.
- Nothing is taken away: swipe stays; every check is still reachable (chapter → verse → check); text stays selectable; Sync stays.

## Out of scope

Slice 2; following rc links; book names from a project's `localizedNames` (a follow-up if wanted); other languages.

## Rules and their level

- Every string in both languages: level 1, `es` does not compile without the key.
- No inline user text in screens: level 2, the ESLint rule.
- Markdown like tC4: the copied file and `npm run check:provenance`.

## Open questions for the owner

None blocking.
