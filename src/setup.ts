/**
 * Builds the Royal Bears server from the blueprint in structure.ts.
 *
 * Safe to run more than once: anything that already exists is reused and
 * updated rather than duplicated. Nothing is ever deleted.
 */

import 'dotenv/config'
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  OverwriteType,
  PermissionFlagsBits as P,
  type CategoryChannel,
  type Guild,
  type OverwriteResolvable,
  type Role,
} from 'discord.js'
import { CATEGORIES, ROLE, ROLES, type CategoryDef, type ChannelDef } from './structure.js'

const { DISCORD_TOKEN, GUILD_ID } = process.env

if (!DISCORD_TOKEN || !GUILD_ID) {
  console.error('Missing DISCORD_TOKEN or GUILD_ID. Copy .env.example to .env and fill it in.')
  process.exit(1)
}

const log = (msg: string) => console.log(msg)
const created: string[] = []
const reused: string[] = []

async function ensureRoles(guild: Guild): Promise<Map<string, Role>> {
  const byName = new Map<string, Role>()
  await guild.roles.fetch()

  for (const def of ROLES) {
    const existing = guild.roles.cache.find((r) => r.name === def.name && !r.managed)
    if (existing) {
      reused.push(`role ${def.name}`)
      byName.set(def.name, existing)
      continue
    }
    const role = await guild.roles.create({
      name: def.name,
      color: def.color,
      hoist: def.hoist ?? false,
      mentionable: def.mentionable ?? false,
      permissions: def.permissions ?? [],
      reason: 'Royal Bears server setup',
    })
    created.push(`role ${def.name}`)
    byName.set(def.name, role)
  }

  await orderRoles(guild, byName)
  return byName
}

/**
 * Puts the roles in the order listed in structure.ts, stacked directly beneath
 * the bot's own role. Discord will not let a bot move anything above itself,
 * so if there is not enough room we say so rather than failing silently.
 */
async function orderRoles(guild: Guild, byName: Map<string, Role>) {
  const me = await guild.members.fetchMe()
  const ceiling = me.roles.highest.position
  const ordered = ROLES.map((d) => byName.get(d.name)).filter((r): r is Role => Boolean(r))

  if (ceiling - ordered.length < 1) {
    log(
      `\n  ! Could not order the roles: the bot's own role sits at position ${ceiling},\n` +
        `    which leaves no room for ${ordered.length} roles beneath it.\n` +
        `    Fix: Server Settings > Roles, drag the bot's role to the top, then re-run.\n`,
    )
    return
  }

  const positions = ordered.map((role, i) => ({ role, position: ceiling - 1 - i }))
  try {
    await guild.roles.setPositions(positions)
    log('  ordered roles')
  } catch (err) {
    log(`  ! Could not order the roles (${(err as Error).message}). Drag them manually if it matters.`)
  }
}

/** Who can see a category, expressed as Discord permission overwrites. */
function viewOverwrites(guild: Guild, def: CategoryDef, roles: Map<string, Role>): OverwriteResolvable[] {
  if (!def.viewableBy) return []
  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel], type: OverwriteType.Role },
  ]
  for (const name of def.viewableBy) {
    const role = roles.get(name)
    if (role) overwrites.push({ id: role.id, allow: [P.ViewChannel], type: OverwriteType.Role })
  }
  return overwrites
}

/** Read-only means everyone can see it, only Staff and Coach can post in it. */
function channelOverwrites(
  guild: Guild,
  category: CategoryDef,
  channel: ChannelDef,
  roles: Map<string, Role>,
): OverwriteResolvable[] {
  const base = viewOverwrites(guild, category, roles)
  if (!channel.readOnly) return base

  const merged = new Map<string, OverwriteResolvable>()
  for (const o of base) merged.set(String(o.id), o)

  const everyone = merged.get(guild.roles.everyone.id)
  merged.set(guild.roles.everyone.id, {
    id: guild.roles.everyone.id,
    type: OverwriteType.Role,
    deny: [...((everyone?.deny as bigint[]) ?? []), P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads],
  })

  for (const name of [ROLE.staff, ROLE.coach]) {
    const role = roles.get(name)
    if (!role) continue
    const existing = merged.get(role.id)
    merged.set(role.id, {
      id: role.id,
      type: OverwriteType.Role,
      allow: [...((existing?.allow as bigint[]) ?? []), P.ViewChannel, P.SendMessages, P.CreatePublicThreads],
    })
  }

  return [...merged.values()]
}

const CHANNEL_TYPES = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  forum: ChannelType.GuildForum,
} as const

async function ensureChannels(guild: Guild, roles: Map<string, Role>) {
  await guild.channels.fetch()

  for (const category of CATEGORIES) {
    let parent = guild.channels.cache.find(
      (c): c is CategoryChannel => c.type === ChannelType.GuildCategory && c.name === category.name,
    )

    if (parent) {
      reused.push(`category ${category.name}`)
      await parent.permissionOverwrites.set(viewOverwrites(guild, category, roles), 'Royal Bears server setup')
    } else {
      parent = await guild.channels.create({
        name: category.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: viewOverwrites(guild, category, roles),
        reason: 'Royal Bears server setup',
      })
      created.push(`category ${category.name}`)
    }

    for (const channel of category.channels) {
      const wanted = CHANNEL_TYPES[channel.type]
      // Discord lowercases and hyphenates text channel names, so compare both forms.
      const slug = channel.name.toLowerCase().replace(/\s+/g, '-')
      // Match on type as well as name: a category can hold both a #general text
      // channel and a "General" voice channel, and they are not the same thing.
      const existing = guild.channels.cache.find(
        (c) => c.parentId === parent!.id && c.type === wanted && (c.name === slug || c.name === channel.name),
      )

      if (existing) {
        reused.push(`#${channel.name}`)
        continue
      }

      const elsewhere = guild.channels.cache.find(
        (c) => c.parentId !== parent!.id && c.type === wanted && (c.name === slug || c.name === channel.name),
      )
      if (elsewhere) {
        log(`  ! "${channel.name}" already exists outside ${category.name}. Creating a second one.`)
        log('    Delete the old one in Discord if you do not want the duplicate.')
      }

      await guild.channels.create({
        name: channel.name,
        type: wanted,
        parent: parent.id,
        topic: channel.type === 'voice' ? undefined : channel.topic,
        permissionOverwrites: channelOverwrites(guild, category, channel, roles),
        reason: 'Royal Bears server setup',
      } as never)
      created.push(`#${channel.name}`)
    }
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

client.once('clientReady', async () => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID)
    log(`\nSetting up "${guild.name}"\n`)

    log('Roles')
    const roles = await ensureRoles(guild)

    log('\nChannels')
    await ensureChannels(guild, roles)

    log(`\nCreated ${created.length}:`)
    for (const c of created) log(`  + ${c}`)
    if (reused.length) log(`\nAlready there, left alone: ${reused.length}`)
    log('\nDone.\n')
  } catch (err) {
    console.error('\nSetup failed:', err)
    process.exitCode = 1
  } finally {
    await client.destroy()
  }
})

client.login(DISCORD_TOKEN)
