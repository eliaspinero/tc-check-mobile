/** A screen's error, announced to a screen reader as it appears. Nothing shows without one. */
export default function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="error" role="alert">
      {text}
    </p>
  );
}
