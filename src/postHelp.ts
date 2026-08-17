/**
 * Posts the command list to a channel and pins it.
 *
 * Re-runnable: if the bot already has a pinned help message in that channel it
 * edits that one rather than posting a second, so the pin stays in place and
 * nobody gets notified again.
 *
 *   npm run post-help                 -> posts to #bot-commands
 *   npm run post-help -- general      -> posts to #general instead
 */

import { ChannelType, Client, GatewayIntentBits, type TextChannel } from 'discord.js'
import { config } from './bot/config.js'
import { helpEmbed } from './bot/help.js'

const channelName = process.argv[2] || config.statChannel.replace('stat-updates', 'bot-commands')

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

client.once('clientReady', async (ready) => {
  try {
    const guild = await client.guilds.fetch(config.guildId)
    await guild.channels.fetch()

    const channel = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name === channelName,
    ) as TextChannel | undefined

    if (!channel) {
      console.error(`No text channel called #${channelName} in this server.`)
      process.exitCode = 1
      return
    }

    const pins = await channel.messages.fetchPins()
    const existing = pins.items.find(
      (pin) => pin.message.author.id === ready.user.id && pin.message.embeds[0]?.title?.includes('Royal Bears bot'),
    )?.message

    if (existing) {
      await existing.edit({ embeds: [helpEmbed()] })
      console.log(`Updated the pinned help message in #${channel.name}.`)
      return
    }

    const message = await channel.send({ embeds: [helpEmbed()] })
    await message.pin('Command reference')
    console.log(`Posted and pinned the command list in #${channel.name}.`)
  } catch (err) {
    console.error('Failed:', err)
    process.exitCode = 1
  } finally {
    await client.destroy()
  }
})

client.login(config.token)
