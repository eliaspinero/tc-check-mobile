/** A tW article's `# ` title line, and the article without it. No title line: title is null and the body is whole. */
export const splitTitle = (md: string): { title: string | null; body: string } => {
  const lines = md.split(/\r?\n/);
  const first = lines.findIndex((l) => l.startsWith('# '));
  if (first < 0) return { title: null, body: md };
  return { title: lines[first].slice(2).trim(), body: lines.filter((_, i) => i !== first).join('\n') };
};
