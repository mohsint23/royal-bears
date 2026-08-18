import { MessageFlags, type ChatInputCommandInteraction, type Guild, type GuildMember } from 'discord.js'
import { ROLE_NAMES, STAFF_ROLES, TRACKER_ROLES } from './config.js'

export function isStaff(member: GuildMember | null): boolean {
  if (!member) return false
  if (member.id === member.guild.ownerId) return true
  return member.roles.cache.some((r) => STAFF_ROLES.includes(r.name))
}

/** Captains and the officer — the people who read the tracker channel. */
export function isTracker(member: GuildMember | null): boolean {
  if (!member) return false
  if (member.id === member.guild.ownerId) return true
  return member.roles.cache.some((r) => TRACKER_ROLES.includes(r.name))
}

export const TEAM_ROLE = { a: ROLE_NAMES.aTeam, b: ROLE_NAMES.bTeam } as const
export type TeamKey = keyof typeof TEAM_ROLE

/**
 * Which roster a member belongs to. A wins outright: someone who plays for
 * A Team while captaining B Team is an A Team player, and should be counted
 * once, there.
 */
export function teamOf(member: GuildMember): TeamKey | undefined {
  const names = new Set(member.roles.cache.map((r) => r.name))
  if (names.has(ROLE_NAMES.aTeam) || names.has(ROLE_NAMES.captainA)) return 'a'
  if (names.has(ROLE_NAMES.bTeam) || names.has(ROLE_NAMES.captainB)) return 'b'
  return undefined
}

/** Rosters come from Discord roles, so there is one source of truth. */
export async function rosterMembers(guild: Guild, team: TeamKey): Promise<GuildMember[]> {
  const role = guild.roles.cache.find((r) => r.name === TEAM_ROLE[team])
  if (!role) return []
  // Fetching the member list goes over the gateway and is rate limited hard, so
  // only ask when the cache is actually short. Two roster lookups in a row would
  // otherwise be two full fetches.
  if (guild.members.cache.size < guild.memberCount) await guild.members.fetch()
  return [...role.members.values()].filter((m) => !m.user.bot)
}

/** Splits "Faker#KR1" into its two halves, tolerating stray spaces. */
export function parseRiotId(input: string): { gameName: string; tagLine: string } | undefined {
  const [name, tag, ...rest] = input.trim().split('#')
  if (!name || !tag || rest.length) return undefined
  return { gameName: name.trim(), tagLine: tag.trim() }
}

export async function replyError(i: ChatInputCommandInteraction, message: string) {
  const body = { content: message, flags: MessageFlags.Ephemeral } as const
  if (i.deferred || i.replied) await i.editReply({ content: message })
  else await i.reply(body)
}
