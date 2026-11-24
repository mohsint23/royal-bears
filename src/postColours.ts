/**
 * Sets up the name-colour picker in 📋 INFO.
 *
 *   npm run post-colours
 *
 * Only ever adds or edits its own things, and is safe to run again:
 *
 *   · one role per colour in COLOURS (colour set, not hoisted, no permissions)
 *   · those roles moved directly under the bot's own role, which is as high as
 *     the bot is allowed to place them
 *   · #colours in 📋 INFO, right after #get-roles, with #get-roles' overwrites
 *     plus Add Reactions denied for @everyone, so the only hearts on the
 *     message are the bot's (members can still click existing reactions)
 *   · the picker message, edited in place, with one seed reaction per colour
 *
 * The colours only show for people on a team if the bot's role is above the
 * team, rank and staff roles. The bot cannot move itself there; drag
 * "Royal Bear" to the top of Server Settings > Roles once, then run this again.
 */

import {
  ChannelType,
  Client,
  GatewayIntentBits,
  OverwriteType,
  PermissionFlagsBits,
  type Guild,
  type Role,
  type TextChannel,
} from 'discord.js'
import { config } from './bot/config.js'
import { COLOURS, COLOURS_CHANNEL, colourFor, coloursEmbed, findColoursMessage } from './bot/colours.js'
import { CATEGORIES } from './structure.js'

const INFO = '📋 INFO'
const AFTER = 'get-roles'
const TOPIC =
  CATEGORIES.find((c) => c.name === INFO)?.channels.find((c) => c.name === COLOURS_CHANNEL)?.topic ?? ''

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

client.once('clientReady', async (ready) => {
  try {
    const guild = await client.guilds.fetch(config.guildId)
    await guild.roles.fetch()
    await guild.channels.fetch()

    const roles = await ensureRoles(guild)
    await placeAtTop(guild, roles)
    const channel = await ensureChannel(guild)

    const body = { embeds: [coloursEmbed()] }
    let message = await findColoursMessage(guild, ready.user.id)
    if (message) {
      await message.edit(body)
      console.log(`Updated the picker in #${channel.name}.`)
    } else {
      message = await channel.send(body)
      console.log(`Posted the picker in #${channel.name}.`)
    }
    for (const c of COLOURS) {
      const seeded = message.reactions.cache.find((r) => colourFor(r.emoji.name) === c && r.me)
      if (!seeded) await message.react(c.emoji)
    }

    reportVisibility(guild, roles)
    console.log('The bot must be running (Railway) for reactions to do anything.')
  } catch (err) {
    console.error(err)
    process.exitCode = 1
  } finally {
    client.destroy()
  }
})

async function ensureRoles(guild: Guild): Promise<Role[]> {
  const out: Role[] = []
  for (const c of COLOURS) {
    let role = guild.roles.cache.find((r) => r.name === c.name)
    if (!role) {
      role = await guild.roles.create({
        name: c.name,
        color: c.hex,
        hoist: false,
        mentionable: false,
        permissions: [],
        reason: 'Name colour picker',
      })
      console.log(`Created role ${c.name}.`)
    } else if (role.color !== c.hex) {
      await role.setColor(c.hex, 'Name colour picker')
    }
    out.push(role)
  }
  return out
}

/**
 * Stacks the colour roles directly under the bot's highest role, in list
 * order. Done one role at a time: this server refuses the bulk reorder
 * endpoint (50013) even though single moves work.
 */
async function placeAtTop(guild: Guild, roles: Role[]) {
  const me = guild.members.me ?? (await guild.members.fetchMe())
  for (const role of roles) {
    await guild.roles.fetch()
    const ceiling = me.roles.highest.position
    const target = ceiling - 1
    const fresh = guild.roles.cache.get(role.id)!
    // Already in the band right under the bot.
    if (fresh.position >= ceiling - roles.length && fresh.position < ceiling) continue
    await fresh.setPosition(target, { reason: 'Name colour picker' }).catch((err) => {
      console.warn(`Could not move ${role.name}: ${err.message}`)
    })
  }
}

async function ensureChannel(guild: Guild): Promise<TextChannel> {
  const category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === INFO)
  if (!category) throw new Error(`No ${INFO} category on the server.`)

  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === COLOURS_CHANNEL,
  ) as TextChannel | undefined
  if (existing) return existing

  const template = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === AFTER && c.parentId === category.id,
  ) as TextChannel | undefined

  const overwrites = (template?.permissionOverwrites.cache.map((o) => ({
    id: o.id,
    type: o.type,
    allow: o.allow.bitfield,
    deny: o.deny.bitfield,
  })) ?? []).filter((o) => o.id !== guild.roles.everyone.id)
  const everyone = template?.permissionOverwrites.cache.get(guild.roles.everyone.id)
  overwrites.push({
    id: guild.roles.everyone.id,
    type: OverwriteType.Role,
    allow: everyone?.allow.bitfield ?? 0n,
    deny:
      (everyone?.deny.bitfield ?? 0n) |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.CreatePublicThreads |
      PermissionFlagsBits.CreatePrivateThreads |
      PermissionFlagsBits.AddReactions,
  })

  const channel = await guild.channels.create({
    name: COLOURS_CHANNEL,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: TOPIC,
    permissionOverwrites: overwrites,
    reason: 'Name colour picker',
  })
  if (template) await channel.setPosition(template.position + 1).catch(() => {})
  console.log(`Created #${channel.name} in ${INFO}.`)
  return channel
}

/** Says plainly whether the colours will actually show, and if not, why. */
function reportVisibility(guild: Guild, roles: Role[]) {
  const lowest = Math.min(...roles.map((r) => guild.roles.cache.get(r.id)!.position))
  const above = guild.roles.cache
    .filter((r) => r.color !== 0 && r.position > lowest && !roles.some((c) => c.id === r.id) && !r.managed)
    .sort((a, b) => b.position - a.position)
  if (above.size === 0) {
    console.log('Colour roles sit above every other coloured role, so they will show for everyone.')
    return
  }
  console.warn(
    `\n${above.size} coloured roles sit ABOVE the colour roles, so anyone holding one keeps that colour:\n  ` +
      above.map((r) => r.name).join(', ') +
      '\nFix: Server Settings > Roles, drag "Royal Bear" to the very top, then run "npm run post-colours" again.\n',
  )
}

client.login(config.token)
