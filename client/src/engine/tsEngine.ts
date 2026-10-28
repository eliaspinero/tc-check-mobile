import { deriveForProject, deriveTargetBible, mergeAndReattach, progressOf, twArticlesOf } from '../checking/derive';
import { oldTwlPin, resolveToolBook } from '../checking/resolve';
import { matchQuote, tokenizeVerse } from '../checking/sourceHighlight';
import { targetWords, tokenIndicesFromSelections } from '../checking/selections';
import { withSpanMembers } from '../checking/spanMembers';
import { resolveProjectFrame } from '../checking/projectFrame';
import { renderArticleBlocks } from '../checking/markdown';
import type { CheckingEngine } from './CheckingEngine';

export const tsEngine: CheckingEngine = {
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
  // A verse inside a bridge ( 1-2) reads the bridge's text, as tC4's check screen does.
  parseBook: (usfm) => withSpanMembers(deriveTargetBible(usfm)),
  verseText: (verse) => tokenizeVerse(verse).map((t) => t.text).join('').trim(),
  sourceTokens: (verse, quote, occurrence) => {
    const tokens = tokenizeVerse(verse);
    return { tokens, highlighted: [...matchQuote(tokens, quote, occurrence)].sort((a, b) => a - b) };
  },
  targetTokens: (verseText, selections) => ({
    tokens: targetWords(verseText),
    selected: tokenIndicesFromSelections(verseText, selections),
  }),
  articleBlocks: (markdown) => renderArticleBlocks(markdown),
  // As tC4's ExpandableNote: a TSV note's line breaks arrive escaped (a literal backslash-n).
  noteBlocks: (note) => renderArticleBlocks(note.replace(/\\n/g, '\n')),
};
