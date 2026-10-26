// Copied from unfoldingWord/translationCore4 src/data/vendor.d.ts at b1911407b00577bf04c4bed1499bd5ac45423b0b. Changes: only the usfm-js, bible-reference-range, string-punctuation-tokenizer and proskomma-core declarations (lines 60-end).
declare module 'usfm-js' {
  const usfm: {
    toJSON: (usfm: string, options?: { chunk?: boolean }) => Record<string, unknown>;
    toUSFM: (json: unknown, options?: { forcedNewLines?: boolean }) => string;
  };
  export default usfm;
}

// bible-reference-range ships types but omits `doesReferenceContain`; augment
// the module to add just the member we use (proven uW range engine — B19/F6).
declare module 'bible-reference-range' {
  export function doesReferenceContain(ref: string, subref: string): boolean;
}

// string-punctuation-tokenizer ships no types. `tokenize` returns the word
// tokens of a string, punctuation stripped (§5.2 quote identity — B18; and the
// tN/tW target-word selection — B23). `occurrencesInString` counts a word's
// total occurrences (for the §5.2 selection's `occurrences`).
declare module 'string-punctuation-tokenizer' {
  export function tokenize(options: { text: string }): string[];
  /** `verbose` keeps the classifier's typed tokens (`word`, `number`,
   * `punctuation`, `whitespace`) instead of the bare strings — the form
   * src/data/align/tokenize.ts uses to keep separators (#255). */
  export function tokenize(options: {
    text: string;
    includeWords?: boolean;
    includeNumbers?: boolean;
    includePunctuation?: boolean;
    includeWhitespace?: boolean;
    greedy?: boolean;
    verbose: true;
  }): Array<{ token: string; type: string }>;
  export function occurrencesInString(text: string, subString: string): number;
}

// proskomma-core ships no types. It publishes as one prebuilt bundle, and this
// project uses exactly one corner of it: the versification mapping utilities
// (issue #15). Loaded by a DYNAMIC import in src/data/mapReference.ts so the
// ~233 kB gzipped chunk stays out of the main bundle — an `eng` project never
// fetches it. Keep this declaration loose and honest; the behaviour is asserted
// by test/mapReference.test.ts against the real scheme data.
declare module 'proskomma-core' {
  export const utils: {
    versification: {
      /** Builds per-book, per-chapter succinct mapping tables. Calls
       * preSuccinctVerseMapping internally, so it takes the RAW mappedVerses. */
      succinctifyVerseMappings: (
        mappedVerses: Record<string, string[]>,
      ) => Record<string, Record<string, unknown>>;
      /** Inverts a mappedVerses table. REQUIRES the array value form — handed a
       * string it iterates that string's characters and returns a silently
       * corrupt table (see normalizeScheme in src/data/versification.ts). */
      reverseVersification: (doc: { mappedVerses: Record<string, string[]> }) => {
        reverseMappedVerses: Record<string, string[]>;
      };
      /** [bookCode, [[chapter, verse], ...]]. The inner array may hold more than
       * one pair under the format's many-to-many form. */
      mapVerse: (
        succinctChapter: unknown,
        book: string,
        chapter: number,
        verse: number,
      ) => [string, [number, number][]] | null;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}
