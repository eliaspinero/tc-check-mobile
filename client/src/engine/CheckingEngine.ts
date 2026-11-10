// The one door from the screens to checking logic: tsEngine, over code copied from tC4.
// Decisions are not recorded here but by the Rust tC4's store in the shell (ProjectSource.recordDecision).
import type { CheckItem, DerivedBook, DerivedVerse, ProjectDeriveResult, VerseObject } from '../checking/derive';
import type { SchemeDoc, SchemeName } from '../checking/versification';
import type { Coverage, Resolution, Tool } from '../checking/resolve';
import type { ResourcePin, ResourcesFile } from '../checking/types';
import type { Selection } from '../checking/selections';
import type { SourceToken } from '../checking/sourceHighlight';
import type { ProjectFrame } from '../checking/projectFrame';
import type { ArticleBlock, ArticleSpan } from '../checking/markdown';

export type { ArticleBlock, ArticleSpan, ProjectFrame };
/** What a Check button records (tC4 Check.jsx markValid / markInvalid). */
/** A change to a check's record: the words, and a button's status; no status keeps the one it has (STORAGE.md §5.4). */
export type DecisionPatch = { selections: Selection[] | false; nothingToSelect: boolean; status?: 'valid' | 'invalid' };
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

/** What the frame resolver reads: the project's vrs.json and the platform's scheme documents. */
export interface FrameIO {
  readVersification(): Promise<{ name: string; bytes: string } | null>;
  getVersifications(): Promise<string[]>;
  getVersification(name: string): Promise<unknown>;
}

export interface CheckingEngine {
  /** What a Check button records (tC4 Check.jsx markValid / markInvalid): Valid with words tapped records
   * them, with none "nothing to select"; Invalid clears the selection. */
  patch(button: 'valid' | 'invalid', verseText: string, tapped: number[]): DecisionPatch;
  /** The words alone, saved a moment after a tap: the status stays. Nothing to select only on a valid check left with
   * no words, as Valid with none tapped records. */
  select(verseText: string, tapped: number[], status: 'valid' | 'invalid' | null): DecisionPatch;
  /** The project's versification frame (tC4 resolveProjectFrame): a recorded name, else a fingerprint of vrs.json. */
  projectFrame(repoPath: string, io: FrameIO): Promise<ProjectFrame>;
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
  /** The words of an aligned source verse that render the quote, in verse order, `…` at a gap (tC4 gatewayQuote); null when none resolve. */
  gatewayQuote(verse: { verseObjects?: VerseObject[] } | undefined, quote: string | Array<{ word: string }>, occurrence: number): string | null;
  /** The target verse's words, and the indices of the stored selection. */
  targetTokens(verseText: string, selections: Selection[] | false | undefined): { tokens: string[]; selected: number[] };
  /** A help's markdown as blocks (headings, paragraphs, list items) of styled spans (tC4 renderArticleBlocks). */
  articleBlocks(markdown: string): ArticleBlock[];
  /** A tN note as blocks; its escaped `\n` line breaks split paragraphs (tC4 ExpandableNote). */
  noteBlocks(note: string): ArticleBlock[];
}
