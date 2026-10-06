/**
 * Turning a rank into a number.
 *
 * Its own module, and free of imports that read config, so the comparison can be
 * tested without a token or a database — the ordering it decides is behind the
 * ladder, the roster list, which account a rank role comes from and whether a
 * rank change was a promotion.
 */

import type { RankRow } from './db.js'

const TIER_ORDER: Record<string, number> = {
  IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4,
  EMERALD: 5, DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9,
}
const DIVISION_ORDER: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 }

/**
 * A single number so two ranks can be compared.
 *
 * LP is counted in full. Master, Grandmaster and Challenger have no divisions
 * and run well past 100 LP, so LP is the *only* thing separating two of them —
 * capping it at 99 made every Master from 99 LP upwards score the same and left
 * the order to whatever broke the tie. The weights are far enough apart that a
 * Challenger on 2000 LP still cannot reach the tier above.
 */
export function rankScore(r: Pick<RankRow, 'tier' | 'division' | 'lp'> | undefined): number {
  if (!r?.tier) return -1
  const tier = TIER_ORDER[r.tier] ?? 0
  const div = DIVISION_ORDER[r.division ?? 'IV'] ?? 0
  return tier * 1_000_000 + div * 100_000 + Math.max(r.lp, 0)
}
