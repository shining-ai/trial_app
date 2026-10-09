import { useId, useState } from "react";
import { countSceneText } from "./countSceneText";
import { normalizeSceneText } from "./normalizeSceneText";
import { parseSceneDuration } from "./parseSceneDuration";

export function TextSceneEditor(props: {
  initialText: string;
  /** 表示時間の欄の初期値(例: "3.0") */
  initialDuration: string;
  /** 外から渡される理由(挿入する位置がなくなった、など) */
  error: string | null;
  onConfirm: (text: string, durationTenths: number) => void;
  onCancel: () => void;
}) {
  const { initialText, initialDuration, error, onConfirm, onCancel } = props;
  const [text, setText] = useState(initialText);
  const [duration, setDuration] = useState(initialDuration);
  const [textError, setTextError] = useState<string | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);
  const textId = useId();
  const durationId = useId();
  const { lineCount, charCount } = countSceneText(text);

  function confirm() {
    const normalized = normalizeSceneText(text);
    const parsed = parseSceneDuration(duration);
    setTextError(normalized.ok ? null : normalized.message);
    setDurationError(parsed.ok ? null : parsed.message);
    if (normalized.ok && parsed.ok) onConfirm(normalized.text, parsed.tenths);
  }

  return (
    <div>
      <div>
        <label htmlFor={textId}>テキスト</label>
        <textarea id={textId} rows={5} value={text} onChange={(event) => setText(event.target.value)} />
        <span>{`${lineCount}/5行、${charCount}/100文字`}</span>
      </div>
      <div>
        <label htmlFor={durationId}>表示時間(秒)</label>
        <input
          id={durationId}
          type="text"
          inputMode="decimal"
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
        />
      </div>
      <button type="button" onClick={confirm}>
        確定
      </button>
      <button type="button" onClick={onCancel}>
        取り消し
      </button>
      {textError ? <p role="alert">{textError}</p> : null}
      {durationError ? <p role="alert">{durationError}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
