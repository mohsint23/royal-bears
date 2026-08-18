/**
 * Puts the welcome message in #welcome.
 *
 *   npm run post-welcome
 *
 * Re-runnable: an existing bot message is edited in place rather than a second
 * one being added, so the channel stays a single message.
 */

import { ChannelType, Client, GatewayIntentBits, type TextChannel } from 'discord.js'
import { config } from './bot/config.js'
import { welcomeEmbed, welcomeFiles } from './bot/welcome.js'

const channelName = process.argv[2] || 'welcome'
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
      const found = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildText && c.name === name,
      )
      return found ? `<#${found.id}>` : `#${name}`
    }

    const body = { embeds: [welcomeEmbed(ref)], files: welcomeFiles() }
    const recent = await channel.messages.fetch({ limit: 50 })
    const mine = recent.find((m) => m.author.id === ready.user.id)

    if (mine) {
      await mine.edit(body)
      console.log(`Updated the welcome message in #${channel.name}.`)
    } else {
      await channel.send(body)
      console.log(`Posted the welcome message in #${channel.name}.`)
    }
  } catch (err) {
    const code = (err as { code?: number }).code
    console.error(code === 50013 ? `Missing Permissions on #${channelName}.` : 'Failed:', err)
    process.exitCode = 1
  } finally {
    await client.destroy()
  }
})

client.login(config.token)
