/**
 * Puts the command summary in the tracker channel's topic, where it sits at the
 * top of the channel instead of taking up a message.
 *
 *   npm run post-help
 *
 * Any earlier help message the bot left behind in the channel is removed,
 * pinned or not, so running this after the change tidies up as well as updates.
 */

import { ChannelType, Client, GatewayIntentBits, type TextChannel } from 'discord.js'
import { config } from './bot/config.js'
import { helpEmbed, topicText } from './bot/help.js'

const channelName = process.argv[2] || 'bot-commands'
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

    const topic = topicText()
    await channel.setTopic(topic, 'Command reference')
    console.log(`Set the topic on #${channel.name} (${topic.length}/1024 characters).`)

    // The help used to be posted as a message. Clear out any that are still
    // sitting in the channel — being unpinned is not enough to hide them.
    const title = helpEmbed().data.title
    const recent = await channel.messages.fetch({ limit: 100 })
    let removed = 0

    for (const message of recent.values()) {
      if (message.author.id !== ready.user.id) continue
      if (message.embeds[0]?.title !== title) continue
      await message.delete()
      removed++
    }

    console.log(
      removed ? `Removed ${removed} old help message${removed === 1 ? '' : 's'}.` : 'No old help messages to remove.',
    )
  } catch (err) {
    console.error('Failed:', err)
    process.exitCode = 1
  } finally {
    await client.destroy()
  }
})

client.login(config.token)
