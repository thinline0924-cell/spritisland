// 経験値（マナ結晶）とレベル（SPEC §7.1）

/** レベル L から L+1 に上がるのに必要な結晶 */
export function xpNeeded(level: number): number {
  return 5 + 4 * level + Math.floor(level ** 1.5);
}

/** 結晶を加えた結果。複数レベル一気に上がる場合もある */
export function addXp(level: number, xp: number, gained: number): { level: number; xp: number; levelsGained: number } {
  let l = level;
  let x = xp + gained;
  let levelsGained = 0;
  while (x >= xpNeeded(l)) {
    x -= xpNeeded(l);
    l++;
    levelsGained++;
  }
  return { level: l, xp: x, levelsGained };
}
