import type { Announcements } from "@dnd-kit/core";

/**
 * つかんだ直後の、自分自身の上にいる通知だけを読み上げないようにした読み上げを返す。
 * dnd-kit はつかんだ直後に自分自身の上にいる通知も出すため、そのままだと「つかみました」がすぐ上書きされる。
 * 一度ほかの行や一覧の外へ動いたあとに元の位置へ戻ったときは、元の位置を読み上げる(古い番号を残さないため)。
 */
export function suppressFirstSelfOver(announcements: Announcements): Announcements {
  let movedSinceStart = false;
  return {
    ...announcements,
    onDragStart(args) {
      movedSinceStart = false;
      return announcements.onDragStart(args);
    },
    onDragOver(args) {
      const isSelf = args.over?.id === args.active.id;
      if (isSelf && !movedSinceStart) return undefined;
      movedSinceStart = true;
      return announcements.onDragOver(args);
    },
  };
}
