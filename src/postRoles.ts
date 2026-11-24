/**
 * Puts the four role-picker messages in #get-roles (lanes, games, inhouses, tryouts).
 *
 *   npm run post-roles
 *
 * Re-runnable. Messages the bot already posted are edited in place rather
 * than new ones being added.
 */

import { ChannelType, Client, GatewayIntentBits, type TextChannel } from 'discord.js'
import { config } from './bot/config.js'
import { roleMessages } from './bot/roles.js'
import { syncBotMessages } from './bot/util.js'

const channelName = process.argv[2] || 'get-roles'
const client = new Client({ intents: [GatewayIntentBits.Guilds] })

client.once('clientReady', async (ready) => {
  try {
    const guild = await client.guilds.fetch(config.guildId)
    await guild.channels.fetch()

    const channel = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name === channelName,
    ) as TextChannel | undefined

    if (!channel) {
      console.error(`No text channel called #${channelName}. Run "npm run setup" first.`)
      process.exitCode = 1
      return
    }

    const ref = (name: string) => {
      const found = guild.channels.cache.find((c) => c.name === name)
      return found ? `<#${found.id}>` : `#${name}`
    }

    // Edits the bot's messages in place, sends any missing ones, deletes extras.
    // Messages other people posted in the channel are left alone.
    await syncBotMessages(channel, ready.user.id, roleMessages(ref))
    console.log(`#${channel.name} now holds ${roleMessages(ref).length} picker messages.`)

    console.log('The bot must stay running for the buttons to do anything.')
  } catch (err) {
    const code = (err as { code?: number }).code
    if (code === 50013) {
      console.error(
        `Missing Permissions on #${channelName}. It is read-only, so give the bot's role ` +
          'Send Messages there (or Administrator) and run this again.',
      )
    } else {
      console.error('Failed:', err)
    }
    process.exitCode = 1
  } finally {
    await client.destroy()
  }
})

client.login(config.token)
