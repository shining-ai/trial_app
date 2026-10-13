import { closestCenter, type ClientRect, type CollisionDetection } from "@dnd-kit/core";
import { expect, test } from "vitest";
import { collisionInsideList } from "../../../../src/features/merge/collisionInsideList";

type Args = Parameters<CollisionDetection>[0];

function rect(top: number, height = 50, left = 0, width = 300): ClientRect {
  return { top, left, width, height, bottom: top + height, right: left + width };
}

// 一覧は y=100〜260。行 a・b・c が縦に並ぶ。動かしている行の矩形は b の近く
const LIST = new DOMRect(0, 100, 300, 160);

function args(pointer: { x: number; y: number } | null): Args {
  const ids = ["a", "b", "c"];
  return {
    active: { id: "c" },
    collisionRect: rect(158),
    droppableRects: new Map(ids.map((id, i) => [id, rect(100 + i * 55)])),
    droppableContainers: ids.map((id) => ({ id })),
    pointerCoordinates: pointer,
  } as unknown as Args;
}

const ids = (collisions: ReturnType<CollisionDetection>) => collisions.map((c) => c.id);

test("ポインターが一覧の枠の中なら、いちばん近い行(closestCenter と同じ結果)", () => {
  const inside = args({ x: 150, y: 180 });

  const result = collisionInsideList(() => LIST)(inside);

  expect(ids(result)[0]).toBe("b");
  expect(ids(result)).toEqual(ids(closestCenter(inside)));
});

test("ポインターが一覧の枠の外(上・下・左・右)なら、当たりなし", () => {
  for (const pointer of [{ x: 150, y: 99 }, { x: 150, y: 261 }, { x: -1, y: 180 }, { x: 301, y: 180 }]) {
    expect(collisionInsideList(() => LIST)(args(pointer))).toEqual([]);
  }
});

test("一覧の枠のちょうど端は中として扱う", () => {
  for (const pointer of [{ x: 0, y: 100 }, { x: 300, y: 260 }]) {
    expect(ids(collisionInsideList(() => LIST)(args(pointer)))[0]).toBe("b");
  }
});

test("ポインターの位置がない(キーボード操作)ときは closestCenter と同じ結果", () => {
  const keyboard = args(null);

  expect(ids(collisionInsideList(() => LIST)(keyboard))).toEqual(ids(closestCenter(keyboard)));
});

test("一覧の枠が取れないときは closestCenter と同じ結果", () => {
  const inside = args({ x: 150, y: 180 });

  expect(ids(collisionInsideList(() => null)(inside))).toEqual(ids(closestCenter(inside)));
});
