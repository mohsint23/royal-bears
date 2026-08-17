import { MessageFlags, type ChatInputCommandInteraction, type Guild, type GuildMember } from 'discord.js'
import { ROLE_NAMES, STAFF_ROLES } from './config.js'

export function isStaff(member: GuildMember | null): boolean {
  if (!member) return false
  if (member.id === member.guild.ownerId) return true
  return member.roles.cache.some((r) => STAFF_ROLES.includes(r.name))
}

export const TEAM_ROLE = { a: ROLE_NAMES.aTeam, b: ROLE_NAMES.bTeam } as const
export type TeamKey = keyof typeof TEAM_ROLE

/** Rosters come from Discord roles, so there is one source of truth. */
export async function rosterMembers(guild: Guild, team: TeamKey): Promise<GuildMember[]> {
  const role = guild.roles.cache.find((r) => r.name === TEAM_ROLE[team])
  if (!role) return []
  await guild.members.fetch()
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
