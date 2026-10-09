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
    <div className="scene-editor">
      <div className="scene-editor__fields">
        <div className="field">
          <label className="field__label" htmlFor={textId}>
            テキスト
          </label>
          <textarea
            id={textId}
            className="field__input"
            rows={5}
            placeholder={"例: 2026年10月9日\n京都 嵐山"}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <span className="field__hint">{`${lineCount}/5行、${charCount}/100文字`}</span>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={durationId}>
            表示時間(秒)
          </label>
          <input
            id={durationId}
            className="field__input"
            type="text"
            inputMode="decimal"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          />
          <span className="field__hint">1〜60秒、0.1秒単位</span>
        </div>
      </div>
      {textError ? <p role="alert" className="message message--error">{textError}</p> : null}
      {durationError ? <p role="alert" className="message message--error">{durationError}</p> : null}
      {error ? <p role="alert" className="message message--error">{error}</p> : null}
      <div className="scene-editor__actions">
        <button type="button" className="btn scene-editor__confirm" onClick={confirm}>
          確定
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          取り消し
        </button>
      </div>
    </div>
  );
}
