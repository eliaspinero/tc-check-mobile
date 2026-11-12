// Issue #60: a check reads one verse of each source and of the target, so a book is parsed one chapter at a time,
// the first time a verse of that chapter is asked for. This proves the chapter parse gives every verse exactly as
// the whole-book parse did: Acts in the installed ULT and UST (aligned, the heaviest books) and a target with a
// verse bridge, an empty chapter and headings. (The seeded UST: journeys remove and install UST v90 meanwhile.)
import { test, expect } from '@playwright/test';
import { CLIENT_URL, NEEDS_RIG, readIngredient, rigUp } from './helpers/rig';

const SRC = '/clients/tc-check/src';

const TARGET = String.raw`\id ACT Probe
\usfm 3.0
\h Acts
\mt Acts
\c 1
\s Heading
\p
\v 1 One.
\v 2-3 Two and three.
\v 4 Four \f + \ft a note\f* end.
\c 2
\c 3
\p
\v 1 Three one.
`;

// The chapter markers usfm-js reads besides a clean `\c N` line (#67 review): a leading zero, an indented marker, one
// mid-line, a whole book on one line. Each shows the same verses as the whole-book parse.
const FORMS: Record<string, string> = {
  leadingZero: String.raw`\id TIT
\c 01
\p
\v 1 Paul.
\c 02
\v 1 But you.
`,
  indented: String.raw`\id TIT
\c 1
\p
\v 1 Paul.
   \c 2
\v 1 But you.
`,
  midLine: String.raw`\id TIT
\c 1
\p
\v 1 Paul. \c 2 \p \v 1 But you.
`,
  oneLine: String.raw`\id TIT \c 1 \p \v 1 Paul. \v 2 A servant. \c 2 \p \v 1 But you.`,
};

test('j60 review: chapter markers in the other forms usfm-js reads show the same verses', async ({ page }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await page.goto(CLIENT_URL);
  const differences = await page.evaluate(
    async ({ src, forms }) => {
      const { tsEngine } = await import(`${src}/engine/tsEngine.ts`);
      const { deriveTargetBible } = await import(`${src}/checking/derive.ts`);
      const { withSpanMembers } = await import(`${src}/checking/spanMembers.ts`);
      const out: string[] = [];
      for (const [name, usfm] of Object.entries(forms)) {
        const whole = withSpanMembers(deriveTargetBible(usfm));
        const parsed = tsEngine.parseBook(usfm);
        let verses = 0;
        for (const [chapter, inChapter] of Object.entries(whole.chapters))
          for (const [verse, expected] of Object.entries(inChapter)) {
            verses++;
            // What the check screen shows of the verse (an indented marker leaves trailing spaces in the whole parse).
            if (tsEngine.verseText(parsed.verse(chapter, verse)) !== tsEngine.verseText(expected)) out.push(`${name} ${chapter}:${verse}`);
          }
        if (verses < 2) out.push(`${name}: the whole parse found ${verses} verses`);
      }
      return out;
    },
    { src: SRC, forms: FORMS },
  );
  expect(differences).toEqual([]);
});

test('j60: a book parsed a chapter at a time gives every verse as the whole-book parse does', async ({ page }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await page.goto(CLIENT_URL);
  const books: Record<string, string> = {
    ult: await readIngredient('_local_/_sideloaded_/unfoldingword--en_ult', 'ACT.usfm'),
    ust: await readIngredient('_local_/_sideloaded_/en_ust', 'ACT.usfm'),
    target: TARGET,
  };
  const result = await page.evaluate(
    async ({ src, books }) => {
      const { tsEngine } = await import(`${src}/engine/tsEngine.ts`);
      const { deriveTargetBible } = await import(`${src}/checking/derive.ts`);
      const { withSpanMembers } = await import(`${src}/checking/spanMembers.ts`);
      const differences: string[] = [];
      let verses = 0;
      for (const [name, usfm] of Object.entries(books)) {
        const whole = withSpanMembers(deriveTargetBible(usfm));
        const parsed = tsEngine.parseBook(usfm);
        for (const [chapter, inChapter] of Object.entries(whole.chapters)) {
          for (const [verse, expected] of Object.entries(inChapter)) {
            verses++;
            if (JSON.stringify(parsed.verse(chapter, verse)) !== JSON.stringify(expected)) differences.push(`${name} ${chapter}:${verse}`);
          }
        }
        // A verse the book does not have is absent, as before.
        if (parsed.verse('99', '1') !== undefined || parsed.verse('1', '999') !== undefined) differences.push(`${name} absent verse`);
      }
      return { verses, differences };
    },
    { src: SRC, books },
  );
  // Acts has more than a thousand verses in each source.
  expect(result.verses).toBeGreaterThan(2000);
  expect(result.differences).toEqual([]);
});
