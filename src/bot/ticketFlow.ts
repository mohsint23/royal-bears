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
    prompt: "**1/6** What's your **peak rank**? Say which season too, e.g. *Emerald 2, split 1 this year*.",
  },
  {
    key: 'current_rank',
    label: 'Current rank',
    prompt: '**2/6** And your **current rank** this split?',
  },
  {
    key: 'main_role',
    label: 'Main role',
    prompt: '**3/6** What is your **main role**? Top, Jungle, Mid, ADC or Support.',
  },
  {
    key: 'main_champs',
    label: 'Main-role champs',
    prompt: '**4/6** Which **champions** do you play in that role? Best first.',
  },
  {
    key: 'secondary_roles',
    label: 'Secondary role(s)',
    prompt: '**5/6** Any **secondary role(s)**? List them, or say *none*.',
  },
  {
    key: 'secondary_champs',
    label: 'Secondary champs',
    prompt: '**6/6** And your **champions** for those secondary roles? *None* is fine.',
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
