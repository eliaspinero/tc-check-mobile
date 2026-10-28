// A tN note links articles as `(see: [[rc://en/ta/man/translate/figs-x]])`, and some notes write the address bare:
// `(Ver: rc://es-419/ta/man/translate/figs-x)`. The phone cannot open those articles, so the addresses leave the
// note: translationAcademy names become tags, any other article (`…/tw/dict/bible/names/john`) its last name.

const RC_LINK = /\[\[(rc:\/\/[^\]\s]+)\]\]|(rc:\/\/[^\s)\]]+)/g;
// A parenthesis that holds addresses and at most a few words besides them ("see:", "ver también:", "and").
const RC_ASIDE = /\s*\(([^()]*rc:\/\/[^()]*)\)/g;

const parts = (bracketed: string | undefined, bare: string | undefined) => {
  const address = bracketed ?? bare ?? '';
  const names = address.split('/').filter(Boolean);
  return { academy: names[2] === 'ta', name: names[names.length - 1] ?? '' };
};

/** The note without its addresses, and the Academy articles it names: `first` (the support reference) leads. */
export const noteWithoutAcademyLinks = (note: string, first: string): { text: string; refs: string[] } => {
  const refs = new Set<string>([first]);
  for (const m of note.matchAll(RC_LINK)) {
    const link = parts(m[1], m[2]);
    if (link.academy) refs.add(link.name);
  }
  const text = note
    .replace(RC_ASIDE, (aside, inner: string) => (inner.replace(RC_LINK, '').replace(/[^\p{L}]/gu, '').length <= 12 ? '' : aside))
    .replace(RC_LINK, (_, bracketed?: string, bare?: string) => parts(bracketed, bare).name);
  return { text, refs: [...refs] };
};
