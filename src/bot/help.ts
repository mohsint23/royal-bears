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
  ['/profile `user:` `[account]`', 'Rank, form this week, most-played champions, last five games. Pick yourself for your own.'],
  ['/team `a|b`', 'A whole roster at a glance, with a multi-search link.'],
  ['/multi `a|b`', 'Just the op.gg multi-search link for a roster.'],
  ['/pool upload `image:`', 'Upload a tier list screenshot instead of typing anything. Add `position:` if it covers one role.'],
  ['/pool edit `position:`', 'Or type it in: S, A, B, Willing to learn, Can’t play.'],
  ['/pool unupload', 'Delete an uploaded image.'],
  ['/pool view `user:`', 'Show a pool — the uploaded image, what they typed, or both.'],
  ['/help', 'This message.'],
]

const STAFF: readonly (readonly [string, string])[] = [
  ['/scrim `when:` `team:` `[opponent]`', 'Post a scrim with In / Maybe / Out buttons.'],
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
