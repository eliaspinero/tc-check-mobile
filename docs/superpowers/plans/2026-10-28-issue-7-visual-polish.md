# Issue 7: visual polish — plan

Issue: eliaspinero/tc-check-mobile#7. One pull request, branch `issue-7-visual-polish`, from main c7beccb, brought up to a9537ea before the pull request.
Slice 2 (Valid/Invalid, selection, writing decisions) is out of scope.

## Criteria (the issue's own words)

1. Each check row names the check in words a checker reads: tW rows show the article title, tN rows the quote or the note's title. No row shows a group ID.
2. The tN help has a readable title, not a support reference ID.
3. No help shows an `rc://` address.
4. On 375 × 812, the check screen shows the target verse without scrolling (TIT 1:1).
5. One typeface for the whole app.
6. Fewer boxes: separation from spacing and headings, not a border on every block.
7. The project list and book picker carry the app's name and an accent colour.
8. Spanish and English still read correctly, and every journey still passes.

## Findings (main c7beccb)

- `CheckList.tsx`: the row label is `item.contextId.groupId` (`paul`, `figs-abstractnouns`).
- `CheckScreen.tsx` `Help`: the tN title is `c.groupId`; the note goes to the renderer as written, so `(ver: [[rc://es-419/ta/man/translate/X]])` shows. All 228 rc links in es-419 tN TIT are this tA shape.
- `CheckScreen.tsx`: the target section comes after the ULT and UST panes.
- `app.css`: `input` and `button` keep the browser font (Arial); `.help`, `.pane`, `.verse`, `.check-row` each draw a border.
- No app name on any screen.

## Change by file

- `engine/CheckingEngine.ts`, `engine/tsEngine.ts`: `gatewayQuote(verse, quote, occurrence)` — the ULT words aligned to the original-language quote (tC4's card title, `gatewayQuote` in sourceHighlight.ts).
- `screens/checkLabel.ts` (new): `verseOf` (moved from CheckScreen) and `gatewayOf` — first pane's gateway quote, falling back to the quote string.
- `screens/noteText.ts` (new): `noteWithoutAcademyLinks` — collects the tA article ids as tags, drops a `(ver: …)` aside that holds only links, turns any other tA link into its id.
- `screens/CheckList.tsx`: tW rows show the article's `# ` heading (read from the installed tW) with the ULT words muted beside it; tN rows show the ULT words.
- `screens/CheckScreen.tsx`: tN help titled by the ULT words, tA ids as tags under it; the target right after the help.
- `screens/TopBar.tsx`, `ProjectList.tsx`, `BookPicker.tsx`, `SignIn.tsx`, `i18n/*`: `appName` "tC Check" in the accent colour above the title.
- `app.css`: one font (`font-family: inherit` on inputs and buttons); a surface colour for the help; a dividing line between verses; an accent rule on the target; no per-block borders.

## Proof per criterion

`e2e/j7-polish.spec.ts`, 7 journeys on 375 × 812, each seen failing on c7beccb and passing after: rows (tW, tN), tN help title and tags, no `rc://` across 12 checks, target above the bottom bar, one font, no borders, app name in the accent colour. Criterion 8: the full journey suite; j3, j4, j7, j8, j9 now find the God row by its new text.

## Risks

- Other journeys that find rows by group id: updated (above).
- #12's note paragraphs: the cleaned note still goes through `noteBlocks`.
- Dark mode: colours are tokens with dark values.

## Decisions

See the pull request's "Decisions for approval".

## Open questions for the owner

- The app name on screen ("tC Check") and the accent colour (#1f6fb2).
