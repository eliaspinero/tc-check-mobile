// Copied from unfoldingWord/translationCore4 journal/grammar.mjs at b1911407b00577bf04c4bed1499bd5ac45423b0b. Changes: only STORY_BOOK_ID, isObj, isStoryReference and WHOLE_COLLECTION, typed.
export const STORY_BOOK_ID = 'obs';
const isObj = (v: unknown): v is Record<string, unknown> => v != null && typeof v === 'object' && !Array.isArray(v);
export const isStoryReference = (r: unknown): boolean => isObj(r) && r.story !== undefined && r.bookId === undefined;
export const WHOLE_COLLECTION = 'BIBLE';
