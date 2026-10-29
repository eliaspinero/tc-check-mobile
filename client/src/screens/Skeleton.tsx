/** What a screen shows while it loads: grey shapes where its content will be. */
export type SkeletonShape = 'projects' | 'resources' | 'books' | 'checks' | 'check';

const Bone = ({ size = '' }: { size?: string }) => <span className={`bone ${size}`} />;

/** Each screen's skeleton has the shape of its content: rows of the same height, the same parts in each. */
const SHAPES: Record<SkeletonShape, () => JSX.Element> = {
  projects: () => (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="bone-row">
          <Bone size="w40 tall" />
          <Bone size="w60" />
        </div>
      ))}
    </>
  ),
  resources: () => (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="bone-row across">
          <Bone size="w50" />
          <Bone size="w20" />
        </div>
      ))}
    </>
  ),
  books: () => (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="bone-row across">
          <Bone size="w30 tall" />
          <span className="bone-tools">
            <Bone size="tool" />
            <Bone size="tool" />
          </span>
        </div>
      ))}
    </>
  ),
  checks: () => (
    <>
      <div className="bone-lines">
        <Bone size="w60" />
        <Bone size="w40" />
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="bone-row across">
          <Bone size="w40" />
        </div>
      ))}
    </>
  ),
  check: () => (
    <>
      <Bone size="block" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="bone-lines">
          <Bone size="w20" />
          <Bone />
          <Bone size="w80" />
        </div>
      ))}
    </>
  ),
};

/** A screen reader hears `label` (a live status, as the text line it replaces was read); the shapes are hidden from it. */
export default function Skeleton({ shape, label }: { shape: SkeletonShape; label: string }) {
  const Shape = SHAPES[shape];
  return (
    <div className="skeleton" role="status" data-testid="skeleton" data-shape={shape}>
      <span className="sr-only">{label}</span>
      <div className="skeleton-shapes" aria-hidden="true">
        <Shape />
      </div>
    </div>
  );
}
