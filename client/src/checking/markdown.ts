// Copied from unfoldingWord/translationCore4 src/data/articles.ts at b1911407b00577bf04c4bed1499bd5ac45423b0b. Changes: only the markdown rendering (ArticleSpan to renderArticleBlocks) is copied; the article readers are not.

/** One run of inline text. `text` carries no markdown marks. */
export interface ArticleSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface ArticleBlock {
  kind: 'h' | 'p' | 'li';
  level?: number;
  /** The depth of the `>` quote that holds the block: 1 for `>`, 2 for `> >`. */
  quote?: number;
  /** The plain text of the block: the spans joined. */
  text: string;
  spans: ArticleSpan[];
}

// `__` and `_` open and close only at a word edge, so `figs_metaphor` stays literal.
const EDGE_BEFORE = '(?<![\\p{L}\\p{N}_])';
const EDGE_AFTER = '(?![\\p{L}\\p{N}_])';
const BOLD_ITALIC = /\*\*\*(?!\*)(.+?)(?<!\*)\*\*\*/gu;
// The resources have marks with a space inside (`**nose **`, `__Israel __`) and `__`
// after a story reference (`17:2__David…__`). These are bold too. A blank of
// underscores to fill in (`________`) is not.
const BOLD = new RegExp(`\\*\\*(?!\\*)(.+?)(?<!\\*)\\*\\*|(?<!\\p{L})__(?!_)(.+?)(?<!_)__`, 'gu');
// The `*` of an `rc://*/…` link sits next to a `/`. It is a wildcard, not a mark.
// Nor is an escaped `\*`.
const ITALIC = new RegExp(`(?<![*\\\\])\\*(?![\\s*/])([^*]+?)(?<![\\s/])\\*(?!\\*)|${EDGE_BEFORE}_(?![\\s_])([^_]+?)(?<!\\s)_${EDGE_AFTER}`, 'gu');

/** Split a span at each match of `mark`; the matched part gets `style`. */
const splitSpans = (span: ArticleSpan, mark: RegExp, style: Partial<ArticleSpan>): ArticleSpan[] => {
  const out: ArticleSpan[] = [];
  let at = 0;
  for (const m of span.text.matchAll(mark)) {
    if (m.index > at) out.push({ ...span, text: span.text.slice(at, m.index) });
    out.push({ ...span, ...style, text: m[1] ?? m[2] });
    at = m.index + m[0].length;
  }
  if (at < span.text.length) out.push({ ...span, text: span.text.slice(at) });
  return out;
};

/** The first `length` characters of `spans`, with the style of each span kept. */
export const takeSpans = (spans: ArticleSpan[], length: number): ArticleSpan[] => {
  const out: ArticleSpan[] = [];
  let room = length;
  for (const span of spans) {
    if (room <= 0) break;
    out.push(span.text.length <= room ? span : { ...span, text: span.text.slice(0, room) });
    room -= span.text.length;
  }
  return out;
};

/** Minimal markdown rendering used by the article panels and the note cards.
 * Deliberately tiny: headings, list bullets, `>` quotes, bold, italics,
 * links-to-text. Anything else stays literal — better a plain line than a
 * wrong transform. */
export const renderArticleBlocks = (markdown: string): ArticleBlock[] => {
  const blocks: ArticleBlock[] = [];
  const inline = (s: string): Pick<ArticleBlock, 'text' | 'spans'> => {
    const plain = s
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\\n/g, ' ')
      // TSV notes carry literal "\n" escapes; collapsing runs keeps the result
      // readable prose rather than text pocked with double spaces.
      .replace(/\s+/g, ' ')
      .trim();
    const spans = splitSpans({ text: plain }, BOLD_ITALIC, { bold: true, italic: true })
      .flatMap((span) => splitSpans(span, BOLD, { bold: true }))
      .flatMap((span) => splitSpans(span, ITALIC, { italic: true }));
    return { text: spans.map((span) => span.text).join(''), spans };
  };
  for (const raw of markdown.split('\n')) {
    const marks = /^(?:>\s*)+/.exec(raw.trim())?.[0] ?? '';
    const quote = marks ? { quote: marks.replace(/\s/g, '').length } : {};
    const line = raw.trim().slice(marks.length);
    if (!line) continue;
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'h', level: heading[1].length, ...quote, ...inline(heading[2]) });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      blocks.push({ kind: 'li', ...quote, ...inline(line.replace(/^[-*]\s+/, '')) });
      continue;
    }
    blocks.push({ kind: 'p', ...quote, ...inline(line) });
  }
  return blocks;
};
