// The one door from the screens to checking logic. Slice 1 has one implementation,
// tsEngine, over code copied from tC4. When tC4's Rust crates exist, a second
// implementation calls them through Tauri commands and the screens do not change.
import type { CheckItem, DerivedBook, DerivedVerse, ProjectDeriveResult, VerseObject } from '../checking/derive';
import type { SchemeDoc, SchemeName } from '../checking/versification';
import type { Coverage, Resolution, Tool } from '../checking/resolve';
import type { ResourcePin, ResourcesFile } from '../checking/types';
import type { Selection } from '../checking/selections';
import type { SourceToken } from '../checking/sourceHighlight';
import type { ProjectFrame } from '../checking/projectFrame';
import type { ArticleBlock, ArticleSpan } from '../checking/markdown';
import type { DecisionPatch } from '../checking/recordDecision';

export type { ArticleBlock, ArticleSpan, ProjectFrame };
export type { DecisionPatch };
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

/** The resource a decision file records it was checked against (§5.2 `resource`): repoPath + sha (D58/D59). */
export type DecisionResource = { repoPath: string; version?: string; sha: string; languageSet?: string };

/** A folded journal (tC4 journal/fold.mjs). Opaque to the callers: read it through `journal`. */
export interface JournalFold {
  readonly fold: unknown;
}

/** The §8 journal as tC4 writes it, through code copied from tC4 (journal/*.mjs, seal.ts). */
export interface JournalEngine {
  /** One segment file's events, or why it is refused (tC4 validateSegment). */
  readSegment(raw: string): Promise<{ ok: true; events: unknown[] } | { ok: false; reason: string }>;
  fold(events: unknown[]): JournalFold;
  /** True when the journal holds the book (a `book.add`), the precondition of a decision on it (R-8.5.6). */
  hasBook(fold: JournalFold, book: string): boolean;
  /** The decisions the journal projects for (tool, book). */
  decisions(fold: JournalFold, tool: Tool, book: string): CheckItem[];
  /** The per-project actor id of this installation (tC4 deriveActorId), and a new installation secret. */
  actorId(secret: string, repoPath: string): Promise<string>;
  newSecret(): string;
  /** The actor.json of a new actor (R-8.1.13): no display name, a non-identifying device label. */
  actorDoc(actorId: string, now: string): string;
  /** The sealed segment of one decision on `item`, or null when the journal already holds it unchanged.
   * The clock moves past every ts in the journal first (R-8.2.4). */
  decide(input: { fold: JournalFold; events: unknown[]; actor: string; tool: Tool; book: string; item: CheckItem; patch: DecisionPatch; now: () => number }): Promise<{ name: string; bytes: string; events: unknown[] } | null>;
  /** The derived `checking/<tool>/<BOOK>.json` bytes the fold projects (tC4 projectDecisions). */
  decisionFile(fold: JournalFold, tool: Tool, book: string, resource: DecisionResource): string | null;
  /** What a Check button records (tC4 Check.jsx markValid / markInvalid): Valid with words tapped records
   * them, with none "nothing to select"; Invalid clears the selection. */
  patch(button: 'valid' | 'invalid', verseText: string, tapped: number[]): DecisionPatch;
}

export interface CheckingEngine {
  journal: JournalEngine;
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
