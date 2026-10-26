// The one door from the screens to checking logic. Slice 1 has one implementation,
// tsEngine, over code copied from tC4. When tC4's Rust crates exist, a second
// implementation calls them through Tauri commands and the screens do not change.
import type { CheckItem, ProjectDeriveResult, VerseObject } from '../checking/derive';
import type { SchemeDoc, SchemeName } from '../checking/versification';
import type { Coverage, Resolution, Tool } from '../checking/resolve';
import type { ResourcePin, ResourcesFile } from '../checking/types';
import type { Selection } from '../checking/selections';
import type { SourceToken } from '../checking/sourceHighlight';

export type { CheckItem, Coverage, Resolution, ResourcePin, ResourcesFile, Selection, SourceToken, Tool, VerseObject };

export interface DeriveInput {
  tsv: string;
  tool: Tool;
  bookId: string;
  from: SchemeName | null;
  to: SchemeName | null;
  schemes: Partial<Record<SchemeName, SchemeDoc>>;
  saved: CheckItem[];
  scopeRanges: string[];
  /** tW only: the articles the resolving tw pin carries. */
  twArticles?: ReadonlySet<string>;
}

export interface CheckingEngine {
  /** Which rung's pin supplies this (tool, book), and whether the twl pin is the retired one-repo form. */
  resolve(resources: ResourcesFile, tool: Tool, book: string, coverage: Coverage): Resolution & { oldTwl: boolean };
  deriveItems(input: DeriveInput): Promise<ProjectDeriveResult>;
  progress(items: CheckItem[]): { decided: number; total: number };
  /** An aligned source verse as display tokens, and the token indices the quote highlights. */
  sourceTokens(verse: { verseObjects?: VerseObject[] } | undefined, quote: string | Array<{ word: string }>, occurrence: number): { tokens: SourceToken[]; highlighted: number[] };
  /** The target verse's words, and the indices of the stored selection. */
  targetTokens(verseText: string, selections: Selection[] | false | undefined): { tokens: string[]; selected: number[] };
}
