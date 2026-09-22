/**
 * The tryout questionnaire, minus Discord.
 *
 * Everything here is a pure function so the ordering and naming rules can be
 * tested without a bot token. tickets.ts does the talking.
 */

export const QUESTIONS = [
  {
    key: 'peak_rank',
    label: 'Peak rank',
    prompt: '**1/6** Peak rank?',
  },
  {
    key: 'current_rank',
    label: 'Current rank',
    prompt: '**2/6** Current rank?',
  },
  {
    key: 'main_role',
    label: 'Main role',
    prompt: '**3/6** Main role?',
  },
  {
    key: 'main_champs',
    label: 'Main-role champs',
    prompt: '**4/6** Champs for that role? Best first.',
  },
  {
    key: 'secondary_roles',
    label: 'Secondary role(s)',
    prompt: '**5/6** Secondary role(s)? Or *none*.',
  },
  {
    key: 'secondary_champs',
    label: 'Secondary champs',
    prompt: '**6/6** Champs for those roles?',
  },
] as const

export type QuestionKey = (typeof QUESTIONS)[number]['key']
export type Question = (typeof QUESTIONS)[number]
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
