/**
 * Posts the games check right now, instead of waiting for the morning run.
 *
 *   npm run attendance
 *
 * Useful for seeing what a change looks like, and for re-posting a day the bot
 * was offline for. It does not touch the "already ran today" marker, so the
 * scheduled run still happens as normal.
 */

import { Client, GatewayIntentBits } from 'discord.js'
import { config } from './bot/config.js'
import { postAttendance } from './bot/jobs/attendance.js'

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] })
client.on('error', (err) => console.error('[gateway]', err.message))

client.once('clientReady', async () => {
  try {
    const guild = await client.guilds.fetch(config.guildId)
    console.log('Refreshing from Riot and posting — this can take a minute.')
    await postAttendance(guild)
    console.log(`Posted to #${config.attendanceChannel}.`)
  } catch (err) {
    console.error('Failed:', err)
    process.exitCode = 1
  } finally {
    await client.destroy()
  }
})

client.login(config.token)
