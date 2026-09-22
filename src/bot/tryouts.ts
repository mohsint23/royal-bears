/**
 * The #tryout-info message: what a trial actually involves, and how to apply.
 *
 * Applying itself happens in a bot-made ticket channel (see tickets.ts); this
 * is the explainer people read before pressing the button.
 */

import { baseEmbed, GOLD } from './format.js'

export function tryoutsEmbed(ref: (name: string) => string) {
  return baseEmbed()
    .setColor(GOLD)
    .setTitle('Trying out for a team')
    .setDescription(
      "A Team and B Team play properly; everyone else is here for fun games in the same server. " +
        "Trials are open to anyone — you don't need an invite and you don't need to know anyone.",
    )
    .addFields(
      {
        name: 'Getting in',
        value:
          `1. Hit **I'm here to trial** in ${ref('get-roles')} — that's the Tryout role, which opens ` +
          `${ref('tryout-chat')} and the Tryout Lobby.\n` +
          '2. Press **📩 Open a tryout ticket** under this message. You get a private **#tryout-you** ' +
          'channel only you and the captains can see. Nobody has to approve you first.',
      },
      {
        name: 'Then answer six questions',
        value:
          'In your ticket the bot asks, one at a time:\n' +
          '• your **peak rank** and **current rank**\n' +
          '• your **main role** and the champions you play there\n' +
          '• any **secondary roles** and their champions\n' +
          'One message each, in your own words. Run `/register` first and your op.gg goes on the card automatically.',
      },
      {
        name: 'What happens next',
        value:
          'A captain reads your card and replies in your ticket, usually within a few days. If it ' +
          'looks promising you get pulled into some games with the roster. Your ticket gets marked ' +
          "**Trialling**, then **Accepted** or **Declined**, and you get a DM either way, so you always know where you stand.",
      },
      {
        name: 'What actually matters',
        value:
          "Rank is the least of it. We care more that you talk, that you can take feedback without " +
          'it turning into a row, that you show up when you said you would, and that your champion ' +
          'pool is deep enough to draft around.',
      },
      {
        name: 'A no is not forever',
        value:
          'Rosters change every term and people go on year abroad, so a no now usually means ' +
          `"not this term". Apply again. Playing in ${ref('looking-for-game')} is the fastest way ` +
          'to get noticed anyway.',
      },
    )
}
