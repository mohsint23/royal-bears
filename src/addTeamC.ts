/**
 * One-off: add the C Team section and nothing else.
 *
 *   npm run add-team-c
 *
 * `npm run setup` would create C Team too, but it re-applies the *whole*
 * blueprint on the way past — and this server's Staff role has been renamed by
 * hand, so a full run would create a fresh empty `Staff`, then hand every team
 * category to it and drop the renamed role from the allow lists. This script
 * only ever adds:
 *
 *   · the roles `Team C Captain` and `C Team`
 *   · the 🥉 C TEAM category, with whoever can see 🥈 B TEAM, C roles swapped in
 *   · #chat, #c-scrims, #c-vod-review and the C Team voice channel
 *   · Team C Captain added to Management, INHOUSES and TRYOUTS, where the other
 *     captains already are — an addition to those lists, not a replacement
 *
 * Nothing existing is renamed, moved or deleted, and running it twice is safe:
 * anything already there is reused.
 */

import {
  ChannelType,
  Client,
  GatewayIntentBits,
  type CategoryChannel,
  type Guild,
  type OverwriteResolvable,
  type Role,
} from 'discord.js'
import { config } from './bot/config.js'
import { CATEGORIES, ROLE, ROLES } from './structure.js'

const CATEGORY = '🥉 C TEAM'
/** The C section is the B section with the C roles in place of the B ones. */
const MIRROR = '🥈 B TEAM'

const CHANNEL_TYPES = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  forum: ChannelType.GuildForum,
} as const

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

client.once('clientReady', async () => {
  try {
    const guild = await client.guilds.fetch(config.guildId)
    await guild.roles.fetch()
    await guild.channels.fetch()

    const captainC = await ensureRole(guild, ROLE.captainC)
    const cTeam = await ensureRole(guild, ROLE.cTeam)

    // Directly under their B Team counterparts, so a C Team player shows the
    // team colour rather than their rank colour.
    await placeUnder(guild, captainC, ROLE.captainB)
    await placeUnder(guild, cTeam, ROLE.bTeam)

    const category = await ensureCategory(guild, captainC, cTeam)
    await ensureChannels(guild, category)
    await inviteCaptain(guild, captainC)

    console.log('\nDone. Nothing was deleted or renamed.')
  } catch (err) {
    console.error('Failed:', err)
    process.exitCode = 1
  } finally {
    await client.destroy()
  }
})

async function ensureRole(guild: Guild, name: string): Promise<Role> {
  const existing = guild.roles.cache.find((r) => r.name === name)
  if (existing) {
    console.log(`reused role ${name}`)
    return existing
  }

  const def = ROLES.find((r) => r.name === name)
  if (!def) throw new Error(`${name} is not in the blueprint`)

  const role = await guild.roles.create({
    name,
    color: def.color,
    hoist: def.hoist,
    mentionable: def.mentionable,
    permissions: def.permissions ?? [],
    reason: 'Add C Team',
  })
  console.log(`created role ${name}`)
  return role
}

/**
 * Slots a role in directly below another one.
 *
 * Discord refuses to let a bot move a role above its own, and it reorders one
 * role at a time because the bulk endpoint answers 50013 in this server. A
 * failure here is worth a note rather than an abort: the role exists, it is just
 * sitting at the bottom of the list until somebody drags it.
 */
async function placeUnder(guild: Guild, role: Role, aboveName: string) {
  const above = guild.roles.cache.find((r) => r.name === aboveName)
  if (!above) {
    console.log(`! no ${aboveName} to place ${role.name} under — left where it is`)
    return
  }
  const target = Math.max(above.position - 1, 1)
  if (role.position === target) return

  try {
    await role.setPosition(target)
    console.log(`moved ${role.name} under ${aboveName}`)
  } catch {
    console.log(
      `! could not move ${role.name} under ${aboveName} — the bot's own role sits below them.\n` +
        `  Drag ${role.name} under ${aboveName} in Server Settings → Roles, or move the bot's\n` +
        '  role above the team roles and run this again. Until then a C Team player shows\n' +
        '  their rank colour instead of the team colour.',
    )
  }
}

/** The category, taking whoever can see B TEAM with the C roles swapped in. */
async function ensureCategory(guild: Guild, captainC: Role, cTeam: Role): Promise<CategoryChannel> {
  const existing = guild.channels.cache.find(
    (c): c is CategoryChannel => c.type === ChannelType.GuildCategory && c.name === CATEGORY,
  )
  if (existing) {
    console.log(`reused category ${CATEGORY}`)
    return existing
  }

  const mirror = guild.channels.cache.find(
    (c): c is CategoryChannel => c.type === ChannelType.GuildCategory && c.name === MIRROR,
  )
  if (!mirror) throw new Error(`No ${MIRROR} to copy permissions from`)

  const captainB = guild.roles.cache.find((r) => r.name === ROLE.captainB)
  const bTeam = guild.roles.cache.find((r) => r.name === ROLE.bTeam)
  const swap = new Map<string, string>()
  if (captainB) swap.set(captainB.id, captainC.id)
  if (bTeam) swap.set(bTeam.id, cTeam.id)

  // Copied verbatim apart from the swap, so the renamed staff role and anyone
  // else who can see B TEAM can see C TEAM as well.
  const overwrites: OverwriteResolvable[] = mirror.permissionOverwrites.cache.map((o) => ({
    id: swap.get(o.id) ?? o.id,
    type: o.type,
    allow: o.allow,
    deny: o.deny,
  }))

  const category = await guild.channels.create({
    name: CATEGORY,
    type: ChannelType.GuildCategory,
    position: mirror.position + 1,
    permissionOverwrites: overwrites,
    reason: 'Add C Team',
  })
  console.log(`created category ${CATEGORY} (same visibility as ${MIRROR})`)
  return category
}

/** The four channels from the blueprint. They inherit the category's permissions. */
async function ensureChannels(guild: Guild, category: CategoryChannel) {
  const def = CATEGORIES.find((c) => c.name === CATEGORY)
  if (!def) throw new Error(`${CATEGORY} is not in the blueprint`)

  for (const channel of def.channels) {
    const wanted = CHANNEL_TYPES[channel.type]
    const slug = channel.name.toLowerCase().replace(/\s+/g, '-')
    const existing = guild.channels.cache.find(
      (c) => c.parentId === category.id && c.type === wanted && (c.name === slug || c.name === channel.name),
    )
    if (existing) {
      console.log(`reused #${channel.name}`)
      continue
    }

    await guild.channels.create({
      name: channel.name,
      type: wanted,
      parent: category.id,
      topic: channel.type === 'voice' ? undefined : channel.topic,
      reason: 'Add C Team',
    } as never)
    console.log(`created #${channel.name}`)
  }
}

/**
 * Adds Team C Captain to the categories the other captains can already see.
 * `edit` adds one overwrite; it leaves every other overwrite on the category
 * alone, which `set` would not.
 */
async function inviteCaptain(guild: Guild, captainC: Role) {
  for (const name of ['Management', '🎮 INHOUSES', '🎯 TRYOUTS']) {
    const category = guild.channels.cache.find(
      (c): c is CategoryChannel => c.type === ChannelType.GuildCategory && c.name === name,
    )
    if (!category) {
      console.log(`! no ${name} category — skipped`)
      continue
    }
    if (category.permissionOverwrites.cache.has(captainC.id)) {
      console.log(`${ROLE.captainC} already in ${name}`)
      continue
    }
    await category.permissionOverwrites.edit(captainC, { ViewChannel: true }, { reason: 'Add C Team' })
    console.log(`added ${ROLE.captainC} to ${name}`)
  }
}

client.login(config.token)
