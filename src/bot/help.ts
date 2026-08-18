/**
 * One definition of the command list, used by both /help and the pinned
 * message in the tracker channel, so the two can never disagree.
 */

import { baseEmbed, GOLD } from './format.js'

const EVERYONE: readonly (readonly [string, string])[] = [
  ['/register `riot-id:`', 'Link a Riot account. Do this first. Run it again to add another — up to five.'],
  ['/accounts list `user:`', 'See which accounts are linked and which is the main.'],
  ['/accounts main `account:`', 'Choose which account counts as your main.'],
  ['/accounts remove `account:`', 'Unlink an account.'],
  ['/profile `user:` `[account]`', 'Every account they have linked — rank, form, champions, last five games. Add `account:` for just one.'],
  ['/team `a|b`', 'A whole roster in one embed — every account, mains and alts, with rank, form and champions.'],
  ['/multi `a|b`', 'Just the op.gg multi-search link for a roster.'],
  ['/pool upload `image:`', 'Upload your tier list. Add `position:` if it only covers one role.'],
  ['/pool view `[user]` `[team]`', 'Show a player’s tier list, or a whole roster’s at once. Leave both off for your own.'],
  ['/pool remove', 'Delete one of your tier lists.'],
  ['/help', 'This message.'],
  ['Position roles', 'Not a command — the buttons in #get-roles set Top, Jungle, Mid, ADC and Support.'],
]

const STAFF: readonly (readonly [string, string])[] = [
  ['/scrim `when:` `team:` `[opponent]`', 'Post a scrim with In / Maybe / Out buttons.'],
  ['/pace `[week]` `[refresh]`', 'Captains and officer only. How each roster is tracking against its weekly games.'],
  ['/champ set|remove|list', 'Captains and officer only. Champions a player should be getting ranked games on.'],
  ['/refresh', 'Pull everyone’s latest games from Riot right now.'],
  ['/setkey', 'Paste a fresh Riot API key when the old one expires.'],
]

const FIELD_LIMIT = 1024

/**
 * Splits a command list across as many fields as it needs. Discord caps a field
 * at 1024 characters and rejects the whole message if one goes over, so this
 * cannot be left to chance as commands are added.
 */
function fields(title: string, rows: readonly (readonly [string, string])[]) {
  const chunks: string[] = []
  let current = ''

  for (const [command, what] of rows) {
    const entry = `**${command}**\n${what}`
    if (current && current.length + entry.length + 2 > FIELD_LIMIT) {
      chunks.push(current)
      current = entry
    } else {
      current = current ? `${current}\n\n${entry}` : entry
    }
  }
  if (current) chunks.push(current)

  return chunks.map((value, index) => ({
    name: index === 0 ? title : `${title} (continued)`,
    value,
  }))
}

/**
 * The short version, for a channel topic. Discord caps those at 1024
 * characters, which the full list is nowhere near fitting inside.
 */
export function topicText(): string {
  const text = [
    'Royal Bears bot. Run /help for the full list.',
    '',
    '/register riot-id: — link a Riot account, up to 5',
    '/accounts list|main|remove — manage them',
    '/profile user: — every account, rank and form',
    '/team a|b — the roster, mains and alts',
    '/multi a|b — one op.gg link for a roster',
    '/pool upload image: — upload your tier list',
    '/pool view user:|team: — see tier lists',
    '',
    'Staff: /scrim, /refresh, /setkey',
    'Tracker quiet? The Riot key expires daily — staff run /setkey.',
  ].join('\n')

  if (text.length > 1024) throw new Error(`Channel topic is ${text.length} characters; Discord allows 1024.`)
  return text
}

export function helpEmbed() {
  return baseEmbed()
    .setColor(GOLD)
    .setTitle('Royal Bears bot — what you can do')
    .setDescription(
      'Type `/` in any channel and Discord will suggest these as you go. ' +
        'Options written `like:this` are asked for automatically; `[brackets]` means optional. ' +
        'Most replies are only visible to you.',
    )
    .addFields(
      ...fields('Everyone', EVERYONE),
      ...fields('Staff and captains', STAFF),
      {
        name: 'Roles',
        value:
          'Position roles are self-serve — the buttons in **#get-roles**. Rank roles come from ' +
          'your best linked account automatically. Team roles are given out by staff.',
      },
      {
        name: 'Smurfs and second accounts',
        value:
          'Link up to five. The **main** is what `/team` and `/multi` use, and your rank role comes ' +
          'from your best account, not just the main one.',
      },
      {
        name: 'If the tracker goes quiet',
        value:
          'Riot keys expire every 24 hours. When one dies the bot says so here and pauses. ' +
          'A staff member runs `/setkey` with a fresh one and it picks straight back up.',
      },
    )
}
