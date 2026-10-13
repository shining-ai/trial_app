/**
 * 各動画の長さをミリ秒の整数にしてから足す(0.5ミリ秒は切り上げ)。
 * 浮動小数のまま足すとサーバー(validate_merge_request)と30分の境界の判定が食い違うため、同じ計算にそろえる。
 */
export function sumDurationMilliseconds(durations: number[]): number {
  return durations.reduce((sum, seconds) => sum + Math.floor(seconds * 1000 + 0.5), 0);
}
