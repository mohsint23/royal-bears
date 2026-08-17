/**
 * Royal Bears bot.
 *
 * Slash commands are registered to the one guild, which makes them appear
 * instantly rather than taking up to an hour like global commands do.
 */

import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  type Interaction,
} from 'discord.js'
import { config } from './config.js'
import { byName, commands } from './commands/index.js'
import { handleSetKeyModal, SETKEY_MODAL } from './commands/setkey.js'
import { handlePoolModal, POOL_MODAL } from './commands/pool.js'
import { handleScrimButton, isScrimButton } from './commands/scrim.js'
import { loadChampions } from './ddragon.js'
import { hasKey } from './riot.js'
import { startPolling } from './jobs/poll.js'
import { startWeekly } from './jobs/weekly.js'

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
})

async function registerCommands(applicationId: string) {
  const rest = new REST().setToken(config.token)
  const body = commands.map((c) => c.data.toJSON())
  await rest.put(Routes.applicationGuildCommands(applicationId, config.guildId), { body })
  console.log(`Registered ${body.length} commands: ${commands.map((c) => c.data.name).join(', ')}`)
}

client.once(Events.ClientReady, async (ready) => {
  console.log(`Logged in as ${ready.user.tag}`)

  await loadChampions().catch((err) => console.error('Could not load champion list:', err))
  await registerCommands(ready.user.id)

  if (!hasKey()) {
    console.log('No Riot API key set yet — run /setkey in Discord to start tracking.')
  }

  startPolling(client)
  startWeekly(client)
  console.log('Polling every 30 minutes. Weekly roundup on Sundays at 18:00 UK time.')
})

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      await byName.get(interaction.commandName)?.autocomplete?.(interaction)
      return
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId === SETKEY_MODAL) await handleSetKeyModal(interaction)
      else if (interaction.customId.startsWith(`${POOL_MODAL}:`)) await handlePoolModal(interaction)
      return
    }
    if (interaction.isButton()) {
      if (isScrimButton(interaction.customId)) await handleScrimButton(interaction)
      return
    }
    if (!interaction.isChatInputCommand()) return

    const command = byName.get(interaction.commandName)
    if (!command) return
    await command.execute(interaction)
  } catch (err) {
    console.error(`Interaction "${'commandName' in interaction ? interaction.commandName : interaction.type}" failed:`, err)
    if (interaction.isRepliable()) {
      const message = 'Something went wrong running that. It has been logged.'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: message }).catch(() => {})
      } else {
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {})
      }
    }
  }
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log('\nShutting down.')
    client.destroy().finally(() => process.exit(0))
  })
}

client.login(config.token)
