/**
 * Name colours, picked by reacting to one message in #colours.
 *
 * Discord paints a name in the colour of the member's highest *coloured* role,
 * so these roles sit directly under the bot's own role, above every team, rank
 * and staff role. Picking one therefore overrides your team colour; removing
 * the reaction hands it back. That is the trade-off, and it is opt-in.
 *
 * One colour at a time: reacting with a new colour drops the old role and the
 * old reaction. The reactions on the message are the source of truth, and the
 * bot re-reads them on boot so anything done while it was offline still lands.
 */

import {
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type Role,
  type TextChannel,
  type User,
} from 'discord.js'
import { config } from './config.js'
import { baseEmbed } from './format.js'

export const COLOURS_CHANNEL = 'colours'

export const COLOURS = [
  { emoji: '❤️', name: 'Red', hex: 0xe74c3c },
  { emoji: '🧡', name: 'Orange', hex: 0xf0892e },
  { emoji: '💛', name: 'Yellow', hex: 0xf4d03f },
  { emoji: '💚', name: 'Green', hex: 0x2ecc71 },
  { emoji: '🩵', name: 'Light Blue', hex: 0x74c7f2 },
  { emoji: '💙', name: 'Blue', hex: 0x3b74e8 },
  { emoji: '💜', name: 'Purple', hex: 0xa66bd9 },
  { emoji: '🩷', name: 'Pink', hex: 0xff7eb6 },
  { emoji: '🤎', name: 'Brown', hex: 0xa9714b },
  { emoji: '🩶', name: 'Grey', hex: 0xa3aab3 },
  { emoji: '🤍', name: 'White', hex: 0xf4f4f4 },
  // Second batch. The hearts ran out, so these use emoji that hint at the colour.
  // New entries go on the end: reactions show in the order they were added.
  { emoji: '🍒', name: 'Crimson', hex: 0xb3122e },
  { emoji: '🍑', name: 'Peach', hex: 0xffb38a },
  // Not "Gold": a rank role already has that name, and roles are found by name.
  { emoji: '⭐', name: 'Amber', hex: 0xffc83d },
  { emoji: '🍋', name: 'Lime', hex: 0xb5e655 },
  { emoji: '🌿', name: 'Mint', hex: 0x6ee7b7 },
  { emoji: '🌊', name: 'Teal', hex: 0x1fa5a0 },
  { emoji: '🫐', name: 'Navy', hex: 0x2f4fa8 },
  { emoji: '🪻', name: 'Lavender', hex: 0xc4a7f5 },
  { emoji: '🌸', name: 'Sakura', hex: 0xffc1dc },
] as const

export type Colour = (typeof COLOURS)[number]

/** Discord sometimes reports ❤️ without its variation selector, so compare without it. */
const bare = (emoji: string | null) => (emoji ?? '').replace(/️/g, '')

export const colourFor = (emoji: string | null): Colour | undefined =>
  COLOURS.find((c) => bare(c.emoji) === bare(emoji))

export function coloursEmbed() {
  return baseEmbed()
    .setTitle('🎨 Pick a name colour')
    .setDescription(
      [
        'React to colour your name. Pick another one to switch, or remove your reaction to go back to your team or rank colour.',
        '',
        // Rows of five so 20 colours stay readable on a phone.
        ...Array.from({ length: Math.ceil(COLOURS.length / 5) }, (_, i) =>
          COLOURS.slice(i * 5, i * 5 + 5).map((c) => `${c.emoji} ${c.name}`).join('   '),
        ),
        '',
        '-# One colour at a time. A colour shows over your team colour, so team players may want to leave this alone.',
      ].join('\n'),
    )
}

const colourRoles = (guild: Guild) =>
  COLOURS.map((c) => guild.roles.cache.find((r) => r.name === c.name)).filter((r): r is Role => !!r)

/** The bot's own message in #colours, or undefined if it has not been posted yet. */
export async function findColoursMessage(guild: Guild, botId: string): Promise<Message | undefined> {
  const channel = guild.channels.cache.find((c) => c.name === COLOURS_CHANNEL && c.isTextBased()) as
    | TextChannel
    | undefined
  if (!channel) return undefined
  const recent = await channel.messages.fetch({ limit: 20 })
  return recent.find((m) => m.author.id === botId && m.embeds[0]?.title?.includes('name colour'))
}

/** Gives `member` exactly one colour role (or none), leaving every other role alone. */
async function setColour(member: GuildMember, colour: Colour | undefined) {
  const all = colourRoles(member.guild)
  const target = colour ? all.find((r) => r.name === colour.name) : undefined
  const drop = all.filter((r) => r !== target && member.roles.cache.has(r.id))
  if (drop.length) await member.roles.remove(drop, 'Name colour changed')
  if (target && !member.roles.cache.has(target.id)) await member.roles.add(target, 'Picked a name colour')
}

let messageId: string | undefined

async function resolve(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
  if (user.bot) return undefined
  if (reaction.partial) reaction = await reaction.fetch()
  if (reaction.message.guildId !== config.guildId) return undefined
  const channel = reaction.message.channel
  const onPicker = messageId
    ? reaction.message.id === messageId
    : 'name' in channel && channel.name === COLOURS_CHANNEL
  if (!onPicker) return undefined
  const colour = colourFor(reaction.emoji.name)
  if (!colour) return undefined
  const member = await reaction.message.guild!.members.fetch(user.id)
  return { reaction: reaction as MessageReaction, colour, member }
}

export async function onColourReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
  const hit = await resolve(reaction, user)
  if (!hit) return
  await setColour(hit.member, hit.colour)

  // Take their other hearts off the message so it always shows one pick each.
  const message = hit.reaction.message
  for (const other of message.reactions.cache.values()) {
    if (other === hit.reaction || !colourFor(other.emoji.name)) continue
    // A count of 1 is just the bot's own seed reaction.
    if (other.count > 1) await other.users.remove(user.id).catch(() => {})
  }
}

export async function onColourReactionRemove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
  const hit = await resolve(reaction, user)
  if (!hit) return
  // Only drop the role this heart stood for: when someone switches, the bot
  // removes the old heart itself and the new role must survive that event.
  const role = colourRoles(hit.member.guild).find((r) => r.name === hit.colour.name)
  if (role && hit.member.roles.cache.has(role.id)) await hit.member.roles.remove(role, 'Removed name colour')
}

/**
 * On boot: cache the message (so reaction events fire for it) and apply any
 * picks made while the bot was down. If someone left several hearts, the
 * last one in the list wins and the rest are removed.
 */
export async function syncColours(client: Client) {
  const guild = await client.guilds.fetch(config.guildId)
  await guild.roles.fetch()
  await guild.channels.fetch()
  const message = await findColoursMessage(guild, client.user!.id)
  if (!message) {
    console.log('[colours] No picker in #colours yet. Run "npm run post-colours".')
    return
  }
  messageId = message.id

  const me = guild.members.me ?? (await guild.members.fetchMe())
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    console.warn('[colours] The bot cannot manage roles, so colour picks will fail.')
  }

  const picks = new Map<string, Colour>()
  for (const reaction of message.reactions.cache.values()) {
    const colour = colourFor(reaction.emoji.name)
    if (!colour) continue
    const users = await reaction.users.fetch()
    for (const user of users.values()) {
      if (user.bot) continue
      const earlier = picks.get(user.id)
      if (earlier) {
        const old = message.reactions.cache.find((r) => colourFor(r.emoji.name) === earlier)
        await old?.users.remove(user.id).catch(() => {})
      }
      picks.set(user.id, colour)
    }
  }

  let changed = 0
  for (const [userId, colour] of picks) {
    const member = await guild.members.fetch(userId).catch(() => undefined)
    if (!member) continue
    const role = colourRoles(guild).find((r) => r.name === colour.name)
    if (role && !member.roles.cache.has(role.id)) changed++
    await setColour(member, colour).catch((err) => console.error(`[colours] ${member.user.tag}:`, err.message))
  }
  console.log(`[colours] Picker ready: ${picks.size} picks, ${changed} applied on boot.`)
}
