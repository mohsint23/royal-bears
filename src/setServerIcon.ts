/**
 * Sets the server's icon from assets/server-icon.png.
 *
 *   npm run set-server-icon
 *
 * The artwork is authored as assets/server-icon.svg and rasterised to PNG, so
 * it can be regenerated at any size without going fuzzy:
 *   qlmanage -t -s 512 -o assets assets/server-icon.svg
 *
 * Discord rate-limits guild edits, so this is a script you run when the artwork
 * changes rather than something the bot does on boot.
 */

import { Client, GatewayIntentBits } from 'discord.js'
import { config } from './bot/config.js'

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

client.once('clientReady', async () => {
  try {
    const guild = await client.guilds.fetch(config.guildId)
    await guild.setIcon('./assets/server-icon.png', 'Server branding')
    const updated = await client.guilds.fetch(config.guildId)
    console.log(`Icon set for "${updated.name}": ${updated.iconURL({ size: 256 })}`)
  } catch (err) {
    console.error('Could not set the server icon:', (err as Error).message)
    process.exitCode = 1
  } finally {
    await client.destroy()
  }
})

client.login(config.token)
