// A tN note links its translationAcademy articles as `(see: [[rc://en/ta/man/translate/figs-x]])`.
// The phone cannot open those articles, so the addresses leave the note and their names become tags.

const TA_LINK = /\[\[rc:\/\/[^\]]*?\/ta\/man\/[^\]/]+\/([^\]/]+)\]\]/g;
// A parenthesis that holds Academy links and at most a few words besides them ("see:", "and").
const TA_ASIDE = /\s*\(([^()]*\[\[rc:\/\/[^\]]*\/ta\/[^\]]*\]\][^()]*)\)/g;

/** The note without its Academy addresses, and the articles it names: `first` (the support reference) leads. */
export const noteWithoutAcademyLinks = (note: string, first: string): { text: string; refs: string[] } => {
  const refs = new Set<string>([first]);
  for (const m of note.matchAll(TA_LINK)) refs.add(m[1]);
  const text = note
    .replace(TA_ASIDE, (aside, inner: string) => (inner.replace(TA_LINK, '').replace(/[^\p{L}]/gu, '').length <= 12 ? '' : aside))
    .replace(TA_LINK, (_, id: string) => id);
  return { text, refs: [...refs] };
};
