import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/**
 * 結合リストのドラッグのセンサーを返す。
 * - マウス: 4ピクセル動かしたら開始(クリックと区別する)
 * - タッチ: 250ミリ秒の長押しで開始。5ピクセルまでのずれは許す(長押しでない指の動きはスクロールにする)
 * - キーボード: スペースキーでつかんで置き、Esc キーで取り消す(要件どおり。Enter は使わない)
 */
export function useDragSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );
}
