/**
 * One-off: fold 📊 TRACKER into 🌍 COMMUNITY.
 *
 *   npm run tidy-tracker
 *
 * Moves #stat-updates into COMMUNITY, keeps the #bot-commands people were told
 * to /register in (moving it into COMMUNITY too), deletes the other
 * #bot-commands (bot output only), then deletes the empty TRACKER category.
 * Safe to run twice. Run `npm run setup` afterwards for perms and order.
 */

import { ChannelType, Client, GatewayIntentBits, type GuildChannel, type TextChannel } from 'discord.js'
import { config } from './bot/config.js'

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

client.once('clientReady', async () => {
  try {
    const guild = await client.guilds.fetch(config.guildId)
    await guild.channels.fetch()
    const cat = (name: string) => guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === name)
    const tracker = cat('📊 TRACKER')
    const community = cat('🌍 COMMUNITY')
    if (!community) throw new Error('No 🌍 COMMUNITY category')

    const move = async (ch: GuildChannel | undefined, why: string) => {
      if (!ch || ch.parentId === community.id) return
      await ch.setParent(community.id, { lockPermissions: true, reason: why })
      console.log(`moved #${ch.name} → 🌍 COMMUNITY`)
    }

    if (tracker) {
      const kids = [...guild.channels.cache.filter((c) => c.parentId === tracker.id).values()] as GuildChannel[]
      await move(kids.find((c) => c.name === 'stat-updates'), 'Tracker tidy')
      const oldCommands = kids.find((c) => c.name === 'bot-commands')
      if (oldCommands) {
        await oldCommands.delete('Tracker tidy: duplicate, bot output only')
        console.log('deleted TRACKER/#bot-commands (duplicate)')
      }
    }

    // The #bot-commands where everyone was told to /register lives on.
    const keep = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name === 'bot-commands' && c.parentId !== community.id,
    ) as TextChannel | undefined
    await move(keep, 'Tracker tidy')

    if (tracker) {
      const left = guild.channels.cache.filter((c) => c.parentId === tracker.id).size
      if (left === 0) {
        await tracker.delete('Tracker tidy: empty')
        console.log('deleted 📊 TRACKER')
      } else console.log(`! 📊 TRACKER still has ${left} channel(s), left it alone`)
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
