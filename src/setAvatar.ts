/**
 * Sets the bot's profile picture from assets/avatar.png.
 *
 *   npm run set-avatar
 *
 * Discord rate-limits avatar changes fairly hard, so this is a script you run
 * when the artwork changes rather than something the bot does on boot.
 */

import { Client, GatewayIntentBits } from 'discord.js'
import { config } from './bot/config.js'

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

client.once('clientReady', async (ready) => {
  try {
    await ready.user.setAvatar('./assets/avatar.png')
    console.log(`Avatar set for ${ready.user.tag}.`)
  } catch (err) {
    console.error('Could not set the avatar:', (err as Error).message)
    process.exitCode = 1
  } finally {
    await client.destroy()
  }
})

client.login(config.token)
