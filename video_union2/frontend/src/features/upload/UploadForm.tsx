import type { ChangeEvent } from "react";

const LIMIT_MESSAGE = "一度に結合できるのは100本までです";

export function UploadForm(props: {
  remainingSlots: number;
  showLimitNotice: boolean;
  onSelect: (files: File[]) => void;
}) {
  const { remainingSlots, showLimitNotice, onSelect } = props;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    onSelect(files);
  }

  return (
    <div>
      <label>
        動画ファイルを選択
        <input type="file" accept="video/*" multiple disabled={remainingSlots <= 0} onChange={handleChange} />
      </label>
      {remainingSlots <= 0 || showLimitNotice ? <p>{LIMIT_MESSAGE}</p> : null}
    </div>
  );
}
