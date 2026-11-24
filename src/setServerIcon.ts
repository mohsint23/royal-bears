/**
 * Sets the server's icon from assets/server-icon.png and its banner from
 * assets/server-banner.png (the banner needs boost Level 2; it is skipped,
 * with a note, when the server is below that).
 *
 *   npm run set-server-icon
 *
 * The artwork is authored as assets/server-icon.svg and rasterised to PNG, so
 * it can be regenerated at any size without going fuzzy:
 *   qlmanage -t -s 512 -o assets assets/server-icon.svg
 *
 * The banner is 960x540. qlmanage zooms non-square SVGs, so render a copy with
 * viewBox="0 0 960 960" (art stays in the top 540px) and crop the top 960x540.
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
    if (guild.premiumTier >= 2) {
      await guild.setBanner('./assets/server-banner.png', 'Server branding')
      console.log('Banner set.')
    } else {
      console.log(`Banner skipped: it needs boost Level 2 and the server is at ${guild.premiumTier}.`)
    }
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
