/**
 * Game roles: self-assigned from #get-roles. Anyone can @ them (a /ping
 * command that limited pings to holders was tried and dropped on 2026-11-24).
 * No colour, so a name still goes picked colour > team colour > rank colour.
 *
 * League was the old "Gamers" role and Among Us the hand-made "Amogus"; both
 * were renamed in place on 2026-11-24 so their holders kept them.
 */

import type { Guild, Role } from 'discord.js'

export const GAMES = [
  { key: 'league', role: 'League', emoji: '⚔️' },
  { key: 'overwatch', role: 'Overwatch', emoji: '🦸' },
  { key: 'valorant', role: 'Valorant', emoji: '🔫' },
  { key: 'deadlock', role: 'Deadlock', emoji: '💀' },
  { key: 'amongus', role: 'Among Us', emoji: '🔪' },
  { key: 'dbd', role: 'Dead by Daylight', emoji: '🪝' },
  { key: 'minecraft', role: 'Minecraft', emoji: '⛏️' },
] as const

export type Game = (typeof GAMES)[number]

export const gameByKey = (key: string): Game | undefined => GAMES.find((g) => g.key === key)

export const gameRole = (guild: Guild, game: Game): Role | undefined =>
  guild.roles.cache.find((r) => r.name === game.role)
