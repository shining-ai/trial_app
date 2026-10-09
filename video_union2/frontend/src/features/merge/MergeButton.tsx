import type { MergeCheck } from "./checkMergeable";

export function MergeButton(props: { check: MergeCheck; rejectMessage: string | null; onMerge: () => void }) {
  const { check, rejectMessage, onMerge } = props;
  const message = check.message ?? rejectMessage;

  return (
    <div className="merge-button">
      {message ? (
        <span role="status" className="merge-button__status">
          {message}
        </span>
      ) : null}
      <button type="button" className="btn btn--primary" disabled={!check.mergeable} onClick={onMerge}>
        結合する
      </button>
    </div>
  );
}
