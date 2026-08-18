/**
 * The blueprint for the Royal Bears server.
 *
 * Everything about the server's shape lives in this one file. Change a name,
 * add a channel, or tweak who can see what here, then run `npm run setup`
 * again — the script only creates what's missing and leaves the rest alone.
 */

import { PermissionFlagsBits as P } from 'discord.js'

export const ROLE = {
  staff: 'Staff',
  officer: 'LoL Officer',
  captainA: 'Team A Captain',
  captainB: 'Team B Captain',
  coach: 'Coach',
  aTeam: 'A Team',
  bTeam: 'B Team',
  sub: 'Sub',
  tryout: 'Tryout',
  member: 'Member',
} as const

export type RoleDef = {
  name: string
  /** Hex colour shown on the member's name. Omit for no colour. */
  color?: number
  /** Show this role as its own group in the member sidebar. */
  hoist?: boolean
  /** Can anyone @mention it. */
  mentionable?: boolean
  permissions?: bigint[]
}

/**
 * Listed highest-authority first. The script positions them in this order,
 * so a player's name colour comes from the first role here that they hold.
 */
export const ROLES: RoleDef[] = [
  {
    name: ROLE.staff,
    color: 0xe6b422,
    hoist: true,
    mentionable: true,
    permissions: [
      P.ManageChannels,
      P.ManageRoles,
      P.ManageMessages,
      P.ManageNicknames,
      P.ManageEvents,
      P.KickMembers,
      P.BanMembers,
      P.ModerateMembers,
      P.MentionEveryone,
      P.MuteMembers,
      P.DeafenMembers,
      P.MoveMembers,
    ],
  },
  {
    name: ROLE.officer,
    color: 0xb87be8,
    hoist: true,
    mentionable: true,
    permissions: [
      P.ManageMessages,
      P.ManageNicknames,
      P.ManageEvents,
      P.KickMembers,
      P.ModerateMembers,
      P.MentionEveryone,
      P.MuteMembers,
      P.MoveMembers,
    ],
  },
  {
    name: ROLE.captainA,
    color: 0x1e4bb8,
    hoist: true,
    mentionable: true,
    permissions: [P.ManageMessages, P.ManageEvents, P.MentionEveryone, P.MuteMembers, P.MoveMembers],
  },
  {
    name: ROLE.captainB,
    color: 0x4a7bd4,
    hoist: true,
    mentionable: true,
    permissions: [P.ManageMessages, P.ManageEvents, P.MentionEveryone, P.MuteMembers, P.MoveMembers],
  },
  {
    name: ROLE.coach,
    color: 0xc0a062,
    hoist: true,
    mentionable: true,
    permissions: [P.ManageMessages, P.ManageEvents, P.MentionEveryone, P.MuteMembers, P.MoveMembers],
  },
  { name: ROLE.aTeam, color: 0x2b5fd9, hoist: true, mentionable: true },
  { name: ROLE.bTeam, color: 0x6b94e8, hoist: true, mentionable: true },
  { name: ROLE.sub, color: 0x8fa8c8, hoist: true, mentionable: true },
  { name: ROLE.tryout, color: 0x9aa0a6, hoist: true, mentionable: true },
  { name: ROLE.member, mentionable: true },

  // Assigned automatically by the bot later, from Riot data.
  { name: 'Challenger', color: 0xf0d078 },
  { name: 'Grandmaster', color: 0xc8382f },
  { name: 'Master', color: 0x9b4dca },
  { name: 'Diamond', color: 0x576bce },
  { name: 'Emerald', color: 0x22a45d },
  { name: 'Platinum', color: 0x4ea69b },
  { name: 'Gold', color: 0xe0a930 },
  { name: 'Silver', color: 0x9fb0c0 },
  { name: 'Bronze', color: 0x8c5230 },
  { name: 'Iron', color: 0x6b5a4e },

  // Self-assigned. No colour, so they never override a team colour.
  { name: 'Top', mentionable: true },
  { name: 'Jungle', mentionable: true },
  { name: 'Mid', mentionable: true },
  { name: 'ADC', mentionable: true },
  { name: 'Support', mentionable: true },
]

/** Server-wide settings applied by the setup script. */
export const GUILD = {
  /** Where Discord posts its own "X joined the server" messages. */
  systemChannel: 'general',
}

export type ChannelDef = {
  name: string
  type: 'text' | 'voice' | 'forum'
  topic?: string
  /** Only Staff and Coach can post. Everyone else reads. */
  readOnly?: boolean
  /**
   * Narrows visibility below the category's. Roles the category lets in but
   * this list leaves out are denied explicitly, since a channel sitting in a
   * category otherwise inherits everyone the category allows.
   */
  viewableBy?: string[]
  /**
   * Widens visibility above the category's: everyone sees it even though the
   * category around it is private. The entry point to a restricted area has to
   * be reachable by the people who have not been let in yet.
   */
  public?: boolean
  /** Forum post tags. `moderated` ones can only be applied by staff. */
  tags?: { name: string; emoji?: string; moderated?: boolean }[]
}

export type CategoryDef = {
  name: string
  /** Roles that can see this category. Omit to make it visible to everyone. */
  viewableBy?: string[]
  channels: ChannelDef[]
}

const TEAM_STAFF = [ROLE.staff, ROLE.coach, ROLE.officer]

/** Only these three people run the tracker, so only they see it. */
const TRACKER_STAFF = [ROLE.staff, ROLE.officer, ROLE.captainA, ROLE.captainB]

export const CATEGORIES: CategoryDef[] = [
  {
    name: '📋 INFO',
    channels: [
      { name: 'welcome', type: 'text', readOnly: true, topic: 'Start here — what Royal Bears is and how this server works' },
      { name: 'announcements', type: 'text', readOnly: true, topic: 'Tryouts, fixtures, socials. Everything you actually need to read' },
      { name: 'get-roles', type: 'text', readOnly: true, topic: 'Pick your position. Rank roles are handled by the bot' },
    ],
  },
  {
    name: '💬 SOCIETY',
    channels: [
      { name: 'general', type: 'text', topic: 'Main chat for everyone in the society' },
      { name: 'looking-for-game', type: 'text', topic: 'Post here when you want a duo or a full 5' },
      { name: 'clips', type: 'text', topic: 'Outplays, disasters, and everything in between' },
      { name: 'off-topic', type: 'text', topic: 'Anything that is not League' },
      { name: 'General', type: 'voice' },
      { name: 'Duo Queue 1', type: 'voice' },
      { name: 'Duo Queue 2', type: 'voice' },
    ],
  },
  {
    name: '🏆 A TEAM',
    viewableBy: [...TEAM_STAFF, ROLE.captainA, ROLE.aTeam, ROLE.sub],
    channels: [
      { name: 'chat', type: 'text', topic: 'A Team roster chat' },
      { name: 'a-scrims', type: 'text', topic: 'Scrim scheduling and attendance' },
      { name: 'a-vod-review', type: 'text', topic: 'VOD links and timestamped notes. One thread per game' },
      { name: 'a-champ-pool', type: 'text', topic: 'Who plays what, per role' },
      { name: 'A Team', type: 'voice' },
    ],
  },
  {
    name: '🥈 B TEAM',
    viewableBy: [...TEAM_STAFF, ROLE.captainB, ROLE.bTeam, ROLE.sub],
    channels: [
      { name: 'chat', type: 'text', topic: 'B Team roster chat' },
      { name: 'b-scrims', type: 'text', topic: 'Scrim scheduling and attendance' },
      { name: 'b-vod-review', type: 'text', topic: 'VOD links and timestamped notes. One thread per game' },
      { name: 'b-champ-pool', type: 'text', topic: 'Who plays what, per role' },
      { name: 'B Team', type: 'voice' },
    ],
  },
  {
    name: '🎯 TRYOUTS',
    viewableBy: [...TEAM_STAFF, ROLE.captainA, ROLE.captainB, ROLE.tryout],
    channels: [
      // Both are public: someone who has not been given the Tryout role yet
      // still has to be able to read the terms and put an application in.
      {
        name: 'tryout-info',
        type: 'text',
        readOnly: true,
        public: true,
        topic: 'What we are looking for and how the trial works',
      },
      {
        name: 'tryout-applications',
        type: 'forum',
        public: true,
        topic: 'One thread per applicant. Post your op.gg, roles, and availability',
        tags: [
          { name: 'Top', emoji: '⬆️' },
          { name: 'Jungle', emoji: '🌿' },
          { name: 'Mid', emoji: '✳️' },
          { name: 'ADC', emoji: '🏹' },
          { name: 'Support', emoji: '🛡️' },
          { name: 'Trialling', emoji: '🎯', moderated: true },
          { name: 'Accepted', emoji: '✅', moderated: true },
          { name: 'Declined', emoji: '🚫', moderated: true },
        ],
      },
      { name: 'tryout-chat', type: 'text', topic: 'Questions and chat for people trialling' },
      { name: 'Tryout Lobby', type: 'voice' },
    ],
  },
  {
    name: '📊 TRACKER',
    viewableBy: TRACKER_STAFF,
    channels: [
      { name: 'stat-updates', type: 'text', readOnly: true, topic: 'Rank changes and weekly roundups, posted by the bot' },
      { name: 'bot-commands', type: 'text', topic: 'Run bot commands in here to keep other channels clean' },
      {
        name: 'attendance',
        type: 'text',
        readOnly: true,
        // Deliberately tighter than the rest of the category: this is about
        // players falling short, so the captains being discussed cannot see it.
        viewableBy: [ROLE.staff, ROLE.officer],
        topic: [
          'Games check, posted here every morning at 10:00 UK.',
          'Monday = the finished week, pass or fail. Tue–Sun = pace so far this week.',
          'Target is 10 ranked games a week (solo + flex), across all a player’s accounts.',
          '',
          'Commands — captains and the LoL Officer only, and replies are private to you:',
          '/pace — the same report on demand. week: this week or last. refresh: pull from Riot first (slower, exact).',
          '/champ set user: champion: [note:] — ask a player to get ranked games on a champion.',
          '/champ list [user:] — targets, games played since assigned, and winrate.',
          '/champ remove user: champion: — drop a target.',
        ].join('\n'),
      },
    ],
  },
]
