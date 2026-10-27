// Copied from unfoldingWord/translationCore4 src/data/burritoStore.ts at b1911407b00577bf04c4bed1499bd5ac45423b0b. Changes: only the decision and resource-pin types, LADDER and the set-completeness checks (lines 27-145).
export interface DecisionContextId {
  checkId: string;
  occurrenceNote: string;
  /** verse is a number for single verses (tC3 convention) and the exact USFM span
   * string (e.g. "9-10") for verse spans; identity keys compare String(verse) —
   * never Number() (BURRITO-SPEC §5.2). A story decision (§10.5) carries
   * `{story, frame}` instead, and the two forms never mix. */
  reference:
    | { bookId: string; chapter: number; verse: number | string; story?: undefined; frame?: undefined }
    | { story: number; frame: number; bookId?: undefined; chapter?: undefined; verse?: undefined };
  tool: string;
  groupId: string;
  quote: string | Array<{ word: string; occurrence: number }>;
  quoteString: string;
  glQuote: string;
  occurrence: number;
}

/** Full tC3 check-item shape (BURRITO-SPEC §5.2 — never simplify). */
export interface Decision {
  contextId: DecisionContextId;
  category?: string;
  selections: Array<{ text: string; occurrence: number; occurrences: number }> | false;
  comments: string | false;
  reminders: boolean;
  nothingToSelect: boolean;
  verseEdits: boolean;
  invalidated: boolean;
  modifiedTimestamp?: string;
  status?: 'valid' | 'invalid' | 'todo'; // additive D2 field — normative in BURRITO-SPEC §5.2 since 1.1-draft (2026-07-07)
  /** §5.2 1.19 (#580, D94): on an invalidated record, the user set `status: "invalid"` before the invalidation, so it stays when the record re-attaches. */
  userInvalid?: boolean;
}

export interface DecisionFile {
  schemaVersion: number;
  tool: string;
  book: string;
  /** §5.2 checked-against record. Identity is (repoPath + sha) — D58/D59;
   * `version` is a display label. `sha` stays optional in the TYPE only for
   * the future tC3 import boundary (FR-25 unresolved records); every tC4
   * writer supplies it. */
  resource?: { repoPath: string; version?: string; sha?: string; languageSet?: string };
  decisions: Decision[];
}

/** One §5.3 resource pin. `sha` is the REQUIRED commit identity (40 lowercase
 * hex, D58) verified at sb-zip import (OPEN-QUESTIONS #24); `version` is an
 * OPTIONAL release-tag display label — tags are not enforced upstream, so it
 * is never compared as identity. */
export interface ResourcePin {
  repoPath: string;
  version?: string;
  flavor: string;
  sha: string;
  /** The books this exact pinned commit contains, uppercase (issue #16, D41).
   *
   * OPTIONAL and additive, so `schemaVersion` stays 2 (§9). Recorded at pin
   * time, while the resource is local and its real contents can be read.
   *
   * WHY IT MATTERS: without it, coverage can only be computed from what is
   * installed right now, so "this resource does not have Titus" and "this
   * resource is not downloaded yet" are indistinguishable — and the resolver has
   * to fall back to English for both. Recorded coverage tells them apart, so a
   * covered-but-absent resource is FETCHED rather than silently substituted.
   *
   * Because a pin is immutable — identity is `repoPath` + `sha` (D58) — the
   * content behind it can never change, so recorded coverage never goes stale.
   * It is a fact about that commit, not a cache. */
  books?: string[];
}

/** One language set: a coherent helps suite at pinned versions. The `twl` slot
 * carries the per-book links whose coverage drives (tool, book) resolution. */
export interface LanguageSet {
  gatewayLanguage: { languageId: string; owner: string };
  translationNotes: ResourcePin;
  translationWordsLinks: ResourcePin;
  translationWords: ResourcePin;
  translationAcademy: ResourcePin;
  /** OPTIONAL (§5.3 1.10, D64): the language's comprehension questions (tq).
   * Absent = covers no book; the set stays complete without it. */
  translationQuestions?: ResourcePin;
  /** OPTIONAL (§5.3 1.10, D64): the language's simplified, meaning-based
   * Bible — `en_ust` for English, `<lang>_gst` where a gateway publishes one. */
  simplifiedText?: ResourcePin;
  /** OPTIONAL (§10.6, D75): the OBS source and two checking resources. An OBS
   * set is complete when these three pins and the shared tW/tA pins exist. */
  obs?: ResourcePin;
  'obs-tn'?: ResourcePin;
  'obs-twl'?: ResourcePin;
  /** The OBS questions (#331, D75 amendment): OPTIONAL, read like translationQuestions. */
  'obs-tq'?: ResourcePin;
  /** OPTIONAL (§10.6, D75): a language-set image-pack override. The bundled
   * default pack is independent of this slot and needs no project pin. */
  'obs-images'?: ResourcePin;
}

export const isCompleteBibleLanguageSet = (set: Partial<LanguageSet>): boolean =>
  !!set.translationNotes && !!set.translationWordsLinks && !!set.translationWords && !!set.translationAcademy;

export const isCompleteObsLanguageSet = (set: Partial<LanguageSet>): boolean =>
  !!set.obs && !!set['obs-tn'] && !!set['obs-twl'] && !!set.translationWords && !!set.translationAcademy;

/** `checking/resources.json` — BURRITO-SPEC §5.3 schemaVersion 2 (D17/D30).
 * Exactly two rungs: `primary` (the project's gateway language) and `fallback`
 * (the installed English suite). The automatic ladder is primary → fallback by
 * per-book coverage; any other language is an explicit whole-project change. */
export interface ResourcesFile {
  schemaVersion: number;
  languageSets: { primary: LanguageSet; fallback: LanguageSet };
  resources: Record<string, unknown>;
  extraScripture?: Array<{ id: string } & ResourcePin>;
}

/** The two automatic rungs, in ladder order (D30.2). */
export const LADDER = ['primary', 'fallback'] as const;
export type Rung = (typeof LADDER)[number];

