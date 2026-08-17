import { ChannelType, type Guild, type TextChannel } from 'discord.js'
import { config, ROLE_NAMES } from '../config.js'

export async function statChannel(guild: Guild): Promise<TextChannel | undefined> {
  await guild.channels.fetch()
  const channel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === config.statChannel,
  )
  return channel as TextChannel | undefined
}

/** Mentions the people who can fix a broken key, without pinging the server. */
export function staffMention(guild: Guild): string {
  const names = [ROLE_NAMES.staff, ROLE_NAMES.officer]
  const roles = names
    .map((n) => guild.roles.cache.find((r) => r.name === n))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
  return roles.map((r) => `<@&${r.id}>`).join(' ') || 'Staff'
}
