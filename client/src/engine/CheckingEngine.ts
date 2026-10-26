// The one door from the screens to checking logic. Slice 1 has one implementation,
// tsEngine, over code copied from tC4. When tC4's Rust crates exist, a second
// implementation calls them through Tauri commands and the screens do not change.
import type { CheckItem, DerivedBook, DerivedVerse, ProjectDeriveResult, VerseObject } from '../checking/derive';
import type { SchemeDoc, SchemeName } from '../checking/versification';
import type { Coverage, Resolution, Tool } from '../checking/resolve';
import type { ResourcePin, ResourcesFile } from '../checking/types';
import type { Selection } from '../checking/selections';
import type { SourceToken } from '../checking/sourceHighlight';

export type { CheckItem, DerivedBook, DerivedVerse, Coverage, Resolution, ResourcePin, ResourcesFile, Selection, SourceToken, Tool, VerseObject };

export interface DeriveInput {
  tsv: string;
  tool: Tool;
  bookId: string;
  from: SchemeName | null;
  to: SchemeName | null;
  schemes: Partial<Record<SchemeName, SchemeDoc>>;
  /** The stored §5.2 decisions; merged into the derived list by identity, then re-attached (tC4 mergeAndReattach). */
  saved: CheckItem[];
  /** True when the decision file's resource record is the pin this list derives from (no re-pin):
   * a stored `invalidated` then stays until the checker re-checks it. */
  keepInvalidated: boolean;
  scopeRanges: string[];
  /** tW only: the articles the resolving tw pin carries. */
  twArticles?: ReadonlySet<string>;
}

export interface CheckingEngine {
  /** Which rung's pin supplies this (tool, book), and whether the twl pin is the retired one-repo form. */
  resolve(resources: ResourcesFile, tool: Tool, book: string, coverage: Coverage): Resolution & { oldTwl: boolean };
  /** The derived list with the saved decisions merged in; `orphaned` counts decisions neither pass could place. */
  deriveItems(input: DeriveInput): Promise<ProjectDeriveResult & { orphaned: number }>;
  progress(items: CheckItem[]): { decided: number; total: number };
  /** The tW articles a tw resource carries, from its metadata's ingredient list (§4.2 article gate). */
  twArticles(twMetadata: { ingredients?: Record<string, unknown> }): Set<string>;
  /** Parse a whole USFM book (usfm-js): chapters keyed by the exact chapter and verse strings. */
  parseBook(usfm: string): DerivedBook;
  /** A verse's plain display text, footnotes and section markers dropped. */
  verseText(verse: DerivedVerse | undefined): string;
  /** An aligned source verse as display tokens, and the token indices the quote highlights. */
  sourceTokens(verse: { verseObjects?: VerseObject[] } | undefined, quote: string | Array<{ word: string }>, occurrence: number): { tokens: SourceToken[]; highlighted: number[] };
  /** The target verse's words, and the indices of the stored selection. */
  targetTokens(verseText: string, selections: Selection[] | false | undefined): { tokens: string[]; selected: number[] };
}
