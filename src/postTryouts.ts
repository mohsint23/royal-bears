/**
 * Puts the trial explainer in #tryout-info.
 *
 *   npm run post-tryouts
 *
 * Re-runnable: edits the bot's existing message rather than adding another.
 */

import { ChannelType, Client, GatewayIntentBits, type TextChannel } from 'discord.js'
import { config } from './bot/config.js'
import { tryoutsEmbed } from './bot/tryouts.js'

const channelName = process.argv[2] || 'tryout-info'
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

    const body = { embeds: [tryoutsEmbed(ref)] }
    const recent = await channel.messages.fetch({ limit: 50 })
    const mine = recent.find((m) => m.author.id === ready.user.id)

    if (mine) {
      await mine.edit(body)
      console.log(`Updated the trial explainer in #${channel.name}.`)
    } else {
      await channel.send(body)
      console.log(`Posted the trial explainer in #${channel.name}.`)
    }
  } catch (err) {
    console.error('Failed:', err)
    process.exitCode = 1
  } finally {
    await client.destroy()
  }
})

client.login(config.token)
