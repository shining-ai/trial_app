import type { MergeCheck } from "./checkMergeable";

export function MergeButton(props: { check: MergeCheck; rejectMessage: string | null; onMerge: () => void }) {
  const { check, rejectMessage, onMerge } = props;
  const message = check.message ?? rejectMessage;

  return (
    <div>
      <button type="button" disabled={!check.mergeable} onClick={onMerge}>
        結合する
      </button>
      {message ? <span role="status">{message}</span> : null}
    </div>
  );
}
