/**
 * The tryout questionnaire, minus Discord.
 *
 * Everything here is a pure function so the ordering and naming rules can be
 * tested without a bot token. tickets.ts does the talking.
 */

export const TIERMAKER = 'https://tiermaker.com/create/league-of-legends-always-updated-champions-207393'

/** How an answer arrives: typed text, a team choice, or an uploaded image. */
export type QuestionKind = 'text' | 'team' | 'image'

const LIST = [
  { key: 'riot_id', label: 'Riot ID', kind: 'text', prompt: 'Riot ID? Like `Name#TAG` — it goes on your card as an op.gg link.' },
  { key: 'year', label: 'Year', kind: 'text', prompt: 'What year are you in at uni? (1st, 2nd, 3rd, 4th, masters, PhD…)' },
  { key: 'team', label: 'Applying for', kind: 'team', prompt: 'Which team are you applying for? **A**, **B**, or **A and B**.' },
  { key: 'peak_rank', label: 'Peak rank', kind: 'text', prompt: 'Peak rank?' },
  { key: 'current_rank', label: 'Current rank', kind: 'text', prompt: 'Current rank?' },
  { key: 'main_role', label: 'Main role', kind: 'text', prompt: 'Main role?' },
  { key: 'secondary_roles', label: 'Other roles', kind: 'text', prompt: 'Are you open to playing any other roles? Which, or *no*.' },
  {
    key: 'tier_list',
    label: 'Tier list',
    kind: 'image',
    prompt: `Last one: make a champion tier list at <${TIERMAKER}>, then **upload the image here** (PNG or JPG).`,
  },
] as const

export type QuestionKey = (typeof LIST)[number]['key']
export type Question = { key: QuestionKey; label: string; kind: QuestionKind; prompt: string }

/** Prompts carry their own "n/8" so the count never drifts from the list. */
export const QUESTIONS: readonly Question[] = LIST.map((q, n) => ({
  ...q,
  prompt: `**${n + 1}/${LIST.length}** ${q.prompt}`,
}))

export type Answers = Partial<Record<QuestionKey, string>>
export type TicketStatus = 'open' | 'trialling' | 'accepted' | 'declined' | 'closed'

export function nextQuestion(answers: Answers): Question | undefined {
  return QUESTIONS.find((q) => !answers[q.key])
}

export const isComplete = (answers: Answers): boolean => nextQuestion(answers) === undefined

/** Discord channel names: lowercase, dashes, at most 100 characters. */
export function channelName(status: TicketStatus, username: string): string {
  const prefix = status === 'open' ? 'tryout' : status
  const slug = username
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${prefix}-${slug || 'applicant'}`.slice(0, 100)
}

/** How long a half-finished ticket sits quiet before the one and only nudge. */
export const NUDGE_AFTER = 24 * 60 * 60 * 1000

export function nudgeDue(
  t: { answers: Answers; last_activity: number; nudged_at: number | null },
  now: number,
): boolean {
  if (isComplete(t.answers)) return false
  if (t.nudged_at !== null) return false
  return now - t.last_activity > NUDGE_AFTER
}

/** Answers are free text; keep them to one card field each. */
export const MAX_ANSWER = 500

/** "Name#TAG" → its halves, tolerating stray spaces. Undefined when it is not one. */
export function parseRiotId(input: string): { gameName: string; tagLine: string } | undefined {
  const [name, tag, ...rest] = input.trim().split('#')
  if (!name?.trim() || !tag?.trim() || rest.length) return undefined
  return { gameName: name.trim(), tagLine: tag.trim() }
}

export const TEAMS = ['A', 'B', 'A and B'] as const
export type TeamChoice = (typeof TEAMS)[number]

/** "a", "team b", "both", "a & b", "a and b" → one of TEAMS. */
export function parseTeam(input: string): TeamChoice | undefined {
  const t = input.toLowerCase().replace(/team/g, '').replace(/[^a-z&+/]/g, '')
  if (t === 'both' || t === 'aandb' || t === 'bothab' || t === 'ab' || t === 'a&b' || t === 'a+b' || t === 'a/b' || t === 'either' || t === 'aorb') return 'A and B'
  if (t === 'a') return 'A'
  if (t === 'b') return 'B'
  return undefined
}
