import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction,
} from 'discord.js'
import { keyLooksValid, setKey } from '../riot.js'
import { isStaff } from '../util.js'
import type { Command } from './types.js'

export const SETKEY_MODAL = 'setkey-modal'
export const SETKEY_INPUT = 'setkey-input'

export const setkey: Command = {
  data: new SlashCommandBuilder()
    .setName('setkey')
    .setDescription('Staff only — paste a fresh Riot API key'),

  async execute(i) {
    if (!isStaff(i.member as never)) {
      await i.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral })
      return
    }
    // A modal keeps the key out of the command history sitting in your client.
    const modal = new ModalBuilder().setCustomId(SETKEY_MODAL).setTitle('Riot API key')
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(SETKEY_INPUT)
          .setLabel('Paste the RGAPI- key')
          .setPlaceholder('RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    )
    await i.showModal(modal)
  },
}

export async function handleSetKeyModal(i: ModalSubmitInteraction) {
  await i.deferReply({ flags: MessageFlags.Ephemeral })
  const key = i.fields.getTextInputValue(SETKEY_INPUT).trim()

  if (!key.startsWith('RGAPI-')) {
    await i.editReply('That does not look like a Riot key — they start with `RGAPI-`.')
    return
  }
  if (!(await keyLooksValid(key))) {
    await i.editReply('Riot rejected that key. Generate a fresh one and try again.')
    return
  }

  setKey(key)
  await i.editReply('Key saved and working. Tracking has resumed.')
}
