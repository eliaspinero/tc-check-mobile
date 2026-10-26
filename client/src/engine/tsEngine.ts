import { deriveForProject, progressOf } from '../checking/derive';
import { oldTwlPin, resolveToolBook } from '../checking/resolve';
import { matchQuote, tokenizeVerse } from '../checking/sourceHighlight';
import { targetWords, tokenIndicesFromSelections } from '../checking/selections';
import type { CheckingEngine } from './CheckingEngine';

export const tsEngine: CheckingEngine = {
  resolve: (resources, tool, book, coverage) => ({
    ...resolveToolBook(resources, tool, book, coverage),
    oldTwl: tool === 'translationWords' && oldTwlPin(resources) !== null,
  }),
  deriveItems: (input) =>
    deriveForProject({
      tsv: input.tsv,
      tool: input.tool,
      bookId: input.bookId,
      from: input.from,
      to: input.to,
      schemes: input.schemes,
      saved: input.saved,
      scopeRanges: input.scopeRanges,
      twArticles: input.twArticles,
    }),
  progress: (items) => progressOf(items),
  sourceTokens: (verse, quote, occurrence) => {
    const tokens = tokenizeVerse(verse);
    return { tokens, highlighted: [...matchQuote(tokens, quote, occurrence)].sort((a, b) => a - b) };
  },
  targetTokens: (verseText, selections) => ({
    tokens: targetWords(verseText),
    selected: tokenIndicesFromSelections(verseText, selections),
  }),
};
