import { formatDuration } from "../../lib/formatDuration";
import { MAX_TOTAL_SECONDS } from "./checkMergeable";
import { formatExcess } from "./formatExcess";

export function MergeSummary({ totalSeconds, excessSeconds }: { totalSeconds: number; excessSeconds: number }) {
  return (
    <div>
      <p>{`合計 ${formatDuration(totalSeconds)} / ${formatDuration(MAX_TOTAL_SECONDS)}`}</p>
      {excessSeconds > 0 ? <p>{`結合後の長さが30分を${formatExcess(excessSeconds)}超えています`}</p> : null}
    </div>
  );
}
