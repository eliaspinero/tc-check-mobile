import type { ReactNode } from 'react';
import type { ArticleBlock, ArticleSpan } from '../engine/CheckingEngine';

const Spans = ({ spans }: { spans: ArticleSpan[] }) => (
  <>
    {spans.map((s, i) => {
      let node: ReactNode = s.text;
      if (s.italic) node = <em>{node}</em>;
      if (s.bold) node = <strong>{node}</strong>;
      return <span key={i}>{node}</span>;
    })}
  </>
);

const one = (b: ArticleBlock, key: number) =>
  b.kind === 'h' ? (
    (b.level ?? 1) <= 2 ? <h3 key={key}><Spans spans={b.spans} /></h3> : <h4 key={key}><Spans spans={b.spans} /></h4>
  ) : (
    <p key={key}>
      <Spans spans={b.spans} />
    </p>
  );

/** Rendered help markdown: headings, paragraphs, bullet lists and `>` quotes, with bold and italics. */
export default function Markdown({ blocks }: { blocks: ArticleBlock[] }) {
  const out: ReactNode[] = [];
  let list: ArticleBlock[] = [];
  const flush = () => {
    if (list.length)
      out.push(
        <ul key={`ul-${out.length}`}>
          {list.map((b, i) => (
            <li key={i}>
              <Spans spans={b.spans} />
            </li>
          ))}
        </ul>,
      );
    list = [];
  };
  blocks.forEach((b, i) => {
    if (b.kind === 'li') return list.push(b);
    flush();
    out.push(b.quote ? <blockquote key={i}>{one(b, i)}</blockquote> : one(b, i));
  });
  flush();
  return <>{out}</>;
}
