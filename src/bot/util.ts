import { MessageFlags, type ChatInputCommandInteraction, type Guild, type GuildMember, type MessageCreateOptions, type MessageEditOptions, type TextChannel } from 'discord.js'
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

export { parseRiotId } from './ticketFlow.js'

export async function replyError(i: ChatInputCommandInteraction, message: string) {
  const body = { content: message, flags: MessageFlags.Ephemeral } as const
  if (i.deferred || i.replied) await i.editReply({ content: message })
  else await i.reply(body)
}

/**
 * Makes a channel hold exactly these bot messages, in order: existing ones are
 * edited in place, missing ones sent, leftovers deleted. Re-running never
 * duplicates. Used for the pinned-style posts the bot owns outright.
 */
export async function syncBotMessages(
  channel: TextChannel,
  botId: string,
  bodies: (MessageCreateOptions & MessageEditOptions)[],
): Promise<void> {
  const recent = await channel.messages.fetch({ limit: 50 })
  const mine = [...recent.filter((m) => m.author.id === botId).values()].sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp,
  )
  for (const [n, body] of bodies.entries()) {
    if (mine[n]) await mine[n]!.edit({ ...body, attachments: [] })
    else await channel.send(body)
  }
  for (const extra of mine.slice(bodies.length)) await extra.delete()
}
