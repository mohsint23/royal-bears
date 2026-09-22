/**
 * Puts the trial explainer, with its Open-a-ticket button, in #tryout-info.
 *
 *   npm run post-tryouts
 *
 * Re-runnable: edits the bot's existing message rather than adding another.
 */

import { ChannelType, Client, GatewayIntentBits, type TextChannel } from 'discord.js'
import { config } from './bot/config.js'
import { tryoutsEmbeds } from './bot/tryouts.js'
import { panelRow } from './bot/tickets.js'

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

    // One message per embed, the button on the last. Existing bot messages are
    // edited in order, missing ones sent, leftovers deleted.
    const embeds = tryoutsEmbeds(ref)
    const bodies = embeds.map((embed, n) =>
      n === embeds.length - 1 ? { embeds: [embed], components: [panelRow()] } : { embeds: [embed], components: [] },
    )
    const recent = await channel.messages.fetch({ limit: 50 })
    const mine = [...recent.filter((m) => m.author.id === ready.user.id).values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
    )

    for (const [n, body] of bodies.entries()) {
      if (mine[n]) await mine[n]!.edit(body)
      else await channel.send(body)
    }
    for (const extra of mine.slice(bodies.length)) await extra.delete()
    console.log(`#${channel.name}: ${bodies.length} messages in place.`)
  } catch (err) {
    console.error('Failed:', err)
    process.exitCode = 1
  } finally {
    await client.destroy()
  }
})

client.login(config.token)
