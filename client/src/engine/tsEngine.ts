import { deriveForProject, deriveTargetBible, mergeAndReattach, progressOf, twArticlesOf } from '../checking/derive';
import { oldTwlPin, resolveToolBook } from '../checking/resolve';
import { gatewayQuote, matchQuote, tokenizeVerse } from '../checking/sourceHighlight';
import { selectionsFromTokens, targetWords, tokenIndicesFromSelections } from '../checking/selections';
import { withSpanMembers } from '../checking/spanMembers';
import { resolveProjectFrame } from '../checking/projectFrame';
import { renderArticleBlocks } from '../checking/markdown';
import type { CheckingEngine, DerivedVerse, ParsedBook } from './CheckingEngine';

/**
 * A book parsed one chapter at a time (#60): a check reads one verse of each source and of the target, and a book
 * like Acts takes most of a second to parse whole on a desktop, and longer on a phone. The USFM is cut at each `\c`
 * once; a chapter is parsed with the book's headers the first time one of its verses is asked for, and kept.
 */
const parseByChapter = (usfm: string): ParsedBook => {
  // Chapters start at a `\c N` at the start of a line, as USFM writes them and as usfm-js reads them (j60 holds the two
  // parses equal on whole books).
  const starts = [...usfm.matchAll(/^\\c[ \t]+(\d+)/gm)];
  const head = usfm.slice(0, starts[0]?.index ?? usfm.length);
  const text = new Map(starts.map((m, i) => [m[1], usfm.slice(m.index, starts[i + 1]?.index ?? usfm.length)]));
  const parsed = new Map<string, Record<string, DerivedVerse>>();
  return {
    verse: (chapter, verse) => {
      let verses = parsed.get(chapter);
      if (!verses) {
        const block = text.get(chapter);
        // A verse inside a bridge (`\v 1-2`) reads the bridge's text, as tC4's check screen does.
        verses = block ? (withSpanMembers(deriveTargetBible(head + block)).chapters[chapter] ?? {}) : {};
        parsed.set(chapter, verses);
        text.delete(chapter);
      }
      return verses[verse];
    },
  };
};

export const tsEngine: CheckingEngine = {
  patch: (button, verseText, tapped) => {
    if (button === 'invalid') return { selections: false, nothingToSelect: false, status: 'invalid' };
    const selections = selectionsFromTokens(verseText, [...tapped].sort((a, b) => a - b));
    return { selections: selections.length ? selections : false, nothingToSelect: selections.length === 0, status: 'valid' };
  },
  select: (verseText, tapped, status) => {
    const selections = selectionsFromTokens(verseText, [...tapped].sort((a, b) => a - b));
    return { selections: selections.length ? selections : false, nothingToSelect: status === 'valid' && selections.length === 0 };
  },
  projectFrame: (repoPath, io) =>
    resolveProjectFrame(repoPath, {
      store: { readVersification: () => io.readVersification() },
      api: { getVersification: (name) => io.getVersification(name), getVersifications: () => io.getVersifications() },
    }),
  resolve: (resources, tool, book, coverage) => ({
    ...resolveToolBook(resources, tool, book, coverage),
    oldTwl: tool === 'translationWords' && oldTwlPin(resources) !== null,
  }),
  deriveItems: async (input) => {
    // As tC4 state.jsx does: derive without the saved decisions, then merge them in two passes
    // (identity key, then reference + original quote + occurrence with the groupId tiebreak).
    const derived = await deriveForProject({
      tsv: input.tsv,
      tool: input.tool,
      bookId: input.bookId,
      from: input.from,
      to: input.to,
      schemes: input.schemes,
      scopeRanges: input.scopeRanges,
      twArticles: input.twArticles,
    });
    const { items, orphaned } = mergeAndReattach(derived.items, input.saved, { keepInvalidated: input.keepInvalidated });
    return { ...derived, items, orphaned };
  },
  progress: (items) => progressOf(items),
  twArticles: (meta) => twArticlesOf(meta),
  parseBook: parseByChapter,
  verseText: (verse) => tokenizeVerse(verse).map((t) => t.text).join('').trim(),
  sourceTokens: (verse, quote, occurrence) => {
    const tokens = tokenizeVerse(verse);
    return { tokens, highlighted: [...matchQuote(tokens, quote, occurrence)].sort((a, b) => a - b) };
  },
  gatewayQuote: (verse, quote, occurrence) => gatewayQuote(tokenizeVerse(verse), quote, occurrence),
  targetTokens: (verseText, selections) => ({
    tokens: targetWords(verseText),
    selected: tokenIndicesFromSelections(verseText, selections),
  }),
  articleBlocks: (markdown) => renderArticleBlocks(markdown),
  // As tC4's ExpandableNote: a TSV note's line breaks arrive escaped (a literal backslash-n).
  noteBlocks: (note) => renderArticleBlocks(note.replace(/\\n/g, '\n')),
};
