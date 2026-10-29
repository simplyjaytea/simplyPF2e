import { lootValueGp, parseCoins } from "./builder.mjs";

/**
 * True when more than a quarter of the loot budget still sits as coin after the first purchase pass,
 * so the PC pipeline makes ONE more purchase pass (issue #64 item 6). Pure: no budget, no pass.
 */
export function needsExtraPurchasePass(loot, lootBudget) {
  if (!(lootBudget > 0)) return false;
  return lootValueGp(loot.filter((l) => parseCoins(l.name))) > lootBudget * 0.25;
}
