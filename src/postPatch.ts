/**
 * Posts patch notes to #patch-notes by hand.
 *
 *   npm run patch-notes            # whatever is live now
 *   npm run patch-notes 16.15.1    # a specific Data Dragon version
 *
 * Useful for backfilling, and for seeing what the automatic post will look like
 * without waiting a fortnight for the next patch.
 */

import { Client, GatewayIntentBits } from 'discord.js'
import { config } from './bot/config.js'
import { latestVersion, postPatch } from './bot/jobs/patchnotes.js'
import { patchLabel } from './bot/patch.js'

const client = new Client({ intents: [GatewayIntentBits.Guilds] })
client.on('error', (err) => console.error('[gateway]', err.message))

client.once('clientReady', async () => {
  try {
    const version = process.argv[2] || (await latestVersion())
    if (!version) {
      console.error('Could not work out which version to post.')
      process.exitCode = 1
      return
    }
    const guild = await client.guilds.fetch(config.guildId)
    console.log(`Fetching notes for ${version} (patch ${patchLabel(version)})…`)
    const ok = await postPatch(guild, version)
    console.log(ok ? `Posted to #${config.patchChannel}.` : 'Nothing posted.')
    if (!ok) process.exitCode = 1
  } catch (err) {
    console.error('Failed:', err)
    process.exitCode = 1
  } finally {
    await client.destroy()
  }
})

client.login(config.token)
