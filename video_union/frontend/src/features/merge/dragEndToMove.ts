/** ドラッグを離したときに、並べ替えを行うかを決める。行わないときは null。 */
export function dragEndToMove(
  activeId: string,
  overId: string | null,
  locked: boolean,
): { activeId: string; overId: string } | null {
  if (locked || overId === null || overId === activeId) return null;
  return { activeId, overId };
}
