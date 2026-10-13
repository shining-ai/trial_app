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

  const disabled = remainingSlots <= 0;

  return (
    <div className="upload-form">
      <label className={`file-picker${disabled ? " file-picker--disabled" : ""}`}>
        <span className="file-picker__label">動画ファイルを選択</span>
        <span className="file-picker__hint">クリックして選ぶ(複数可・あと{remainingSlots}本)</span>
        <input
          className="visually-hidden"
          type="file"
          accept="video/*"
          multiple
          aria-label="動画ファイルを選択"
          disabled={disabled}
          onChange={handleChange}
        />
      </label>
      {disabled || showLimitNotice ? <p className="message message--notice">{LIMIT_MESSAGE}</p> : null}
    </div>
  );
}
