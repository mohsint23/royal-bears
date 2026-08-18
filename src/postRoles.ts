/**
 * Puts the position-picker message in #get-roles.
 *
 *   npm run post-roles
 *
 * Re-runnable. If the bot has already posted one it is edited in place rather
 * than a second one being added, so the channel stays a single message.
 */

import { ChannelType, Client, GatewayIntentBits, type TextChannel } from 'discord.js'
import { config } from './bot/config.js'
import { rolesEmbed, roleButtons, roleFiles } from './bot/roles.js'

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

    const embed = rolesEmbed(ref)
    const body = { embeds: [embed], components: roleButtons(), files: roleFiles() }

    const recent = await channel.messages.fetch({ limit: 50 })
    const mine = recent.find(
      (m) => m.author.id === ready.user.id && m.components.length > 0,
    )

    if (mine) {
      await mine.edit(body)
      console.log(`Updated the existing picker in #${channel.name}.`)
    } else {
      const sent = await channel.send(body)
      await sent.pin('Position roles').catch(() => {})
      console.log(`Posted the picker in #${channel.name}.`)
    }

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
