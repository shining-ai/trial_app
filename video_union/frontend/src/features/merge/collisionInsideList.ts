import { closestCenter, type CollisionDetection } from "@dnd-kit/core";

/**
 * ポインターが一覧の枠の外なら「当たりなし」にし、中なら closestCenter を使う当たり判定を作る。
 * closestCenter だけだと、一覧の外で離してもいちばん近い行に並べ替わってしまう(FR-004)。
 * キーボード操作(ポインターの位置がない)や、一覧の枠が取れないときは closestCenter のまま。
 */
export function collisionInsideList(getListRect: () => DOMRect | null): CollisionDetection {
  return (args) => {
    const pointer = args.pointerCoordinates;
    const list = getListRect();
    if (pointer && list) {
      const inside =
        pointer.x >= list.left && pointer.x <= list.right && pointer.y >= list.top && pointer.y <= list.bottom;
      if (!inside) return [];
    }
    return closestCenter(args);
  };
}
