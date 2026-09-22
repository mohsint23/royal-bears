/**
 * The tryout questionnaire, minus Discord.
 *
 * Everything here is a pure function so the ordering and naming rules can be
 * tested without a bot token. tickets.ts does the talking.
 */

const LIST = [
  { key: 'riot_id', label: 'Riot ID', prompt: 'Riot ID? Like `Name#TAG` — it goes on your card as an op.gg link.' },
  { key: 'year', label: 'Year', prompt: 'What year are you in at uni? (1st, 2nd, 3rd, 4th, masters, PhD…)' },
  { key: 'peak_rank', label: 'Peak rank', prompt: 'Peak rank?' },
  { key: 'current_rank', label: 'Current rank', prompt: 'Current rank?' },
  { key: 'main_role', label: 'Main role', prompt: 'Main role?' },
  { key: 'main_champs', label: 'Main-role champs', prompt: 'Champs for that role? Best first.' },
  { key: 'secondary_roles', label: 'Secondary role(s)', prompt: 'Secondary role(s)? Or *none*.' },
  { key: 'secondary_champs', label: 'Secondary champs', prompt: 'Champs for those roles?' },
] as const

export type QuestionKey = (typeof LIST)[number]['key']
export type Question = { key: QuestionKey; label: string; prompt: string }

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
