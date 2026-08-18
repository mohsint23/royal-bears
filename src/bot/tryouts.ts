/**
 * The #tryout-info message: what a trial actually involves, and how to apply.
 *
 * Deliberately not a bot flow — applying is just posting a thread in the forum,
 * so there is nothing to break and nothing to learn.
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
          `Hit **I'm here to trial** in ${ref('get-roles')}. That's it — you get the Tryout role ` +
          `straight away, which opens ${ref('tryout-chat')} and the Tryout Lobby. ` +
          'Nobody has to approve you first.',
      },
      {
        name: 'Then put a post up',
        value:
          `Start a post in ${ref('tryout-applications')} and tag the lanes you play. Worth including:\n` +
          '• your **op.gg** — or run `/register` and say so\n' +
          '• which **roles** you actually want, best first\n' +
          '• rough **availability**, mainly which evenings you can scrim\n' +
          '• anything else useful: past teams, peak rank, how long you have played',
      },
      {
        name: 'What happens next',
        value:
          "A captain replies in your post, usually within a few days. If it looks promising you'll " +
          'get pulled into some games with the roster. Posts get tagged **Trialling**, then ' +
          '**Accepted** or **Declined**, so you always know where you stand.',
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
