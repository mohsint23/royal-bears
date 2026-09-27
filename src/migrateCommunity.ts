/**
 * One-off: the Visitor waiting room becomes the open Community tier.
 *
 *   npm run migrate-community
 *
 * 1. Renames the 💬 SOCIETY category to 🌍 COMMUNITY so setup keeps its channels.
 * 2. Gives every Visitor the Community role (creating it if setup has not yet).
 * 3. Deletes the Visitor role and the 👋 VISITORS category with its channels.
 * Safe to run twice; run `npm run setup` afterwards for positions and perms.
 */

import { ChannelType, Client, GatewayIntentBits } from 'discord.js'
import { config } from './bot/config.js'

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] })

client.once('clientReady', async () => {
  try {
    const guild = await client.guilds.fetch(config.guildId)
    await guild.channels.fetch()
    await guild.roles.fetch()
    await guild.members.fetch()

    const society = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === '💬 SOCIETY')
    const community = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === '🌍 COMMUNITY')
    if (society && !community) {
      await society.setName('🌍 COMMUNITY', 'Community migration')
      console.log('renamed 💬 SOCIETY → 🌍 COMMUNITY')
    }

    let role = guild.roles.cache.find((r) => r.name === 'Community')
    if (!role) {
      role = await guild.roles.create({ name: 'Community', color: 0x6d6f75, hoist: true, mentionable: true, reason: 'Community migration' })
      console.log('created Community role')
    }

    const visitor = guild.roles.cache.find((r) => r.name === 'Visitor')
    if (visitor) {
      let moved = 0
      for (const m of visitor.members.values()) {
        if (!m.roles.cache.has(role.id)) await m.roles.add(role, 'Community migration')
        moved++
      }
      await visitor.delete('Community migration')
      console.log(`moved ${moved} visitor(s) to Community and deleted the Visitor role`)
    }

    const lobby = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === '👋 VISITORS')
    if (lobby) {
      for (const ch of guild.channels.cache.filter((c) => c.parentId === lobby.id).values()) {
        await ch.delete('Community migration')
        console.log(`deleted #${ch.name}`)
      }
      await lobby.delete('Community migration')
      console.log('deleted 👋 VISITORS')
    }
    console.log('Done. Now run: npm run setup')
  } catch (err) {
    console.error('Failed:', err)
    process.exitCode = 1
  } finally {
    await client.destroy()
  }
})

client.login(config.token)
