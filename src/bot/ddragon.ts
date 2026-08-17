/**
 * Data Dragon is Riot's public asset CDN. No API key, no rate limit — it is
 * how we get champion names and portrait images.
 */

let version = '15.1.1'
/** Lowercased display name -> canonical id, e.g. "lee sin" -> "LeeSin". */
let champions = new Map<string, { id: string; name: string }>()
let loadedAt = 0

const DAY = 24 * 60 * 60 * 1000

export async function loadChampions(force = false) {
  if (!force && champions.size && Date.now() - loadedAt < DAY) return

  const versions = (await fetch('https://ddragon.leagueoflegends.com/api/versions.json').then((r) =>
    r.json(),
  )) as string[]
  version = versions[0] ?? version

  const data = (await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
  ).then((r) => r.json())) as { data: Record<string, { id: string; name: string }> }

  const next = new Map<string, { id: string; name: string }>()
  for (const champ of Object.values(data.data)) {
    next.set(champ.name.toLowerCase(), { id: champ.id, name: champ.name })
    next.set(champ.id.toLowerCase(), { id: champ.id, name: champ.name })
  }
  champions = next
  loadedAt = Date.now()
}

/** What people actually type in Discord. */
const ALIASES: Record<string, string> = {
  asol: 'aurelionsol', mf: 'missfortune', tf: 'twistedfate', j4: 'jarvaniv',
  gp: 'gangplank', lb: 'leblanc', cait: 'caitlyn', morde: 'mordekaiser',
  kass: 'kassadin', malz: 'malzahar', sej: 'sejuani', seju: 'sejuani',
  yi: 'masteryi', blitz: 'blitzcrank', ez: 'ezreal', kha: 'khazix',
  rek: 'reksai', vel: 'velkoz', cho: 'chogath', heca: 'hecarim',
  eve: 'evelynn', panth: 'pantheon', xin: 'xinzhao', ori: 'orianna',
  mundo: 'drmundo', ali: 'alistar', naut: 'nautilus', kata: 'katarina',
  kog: 'kogmaw', ww: 'warwick', voli: 'volibear', trund: 'trundle',
  yorick: 'yorick', tk: 'tahmkench', nid: 'nidalee', vlad: 'vladimir',
  aphe: 'aphelios', apheli: 'aphelios', ksante: 'ksante', kaisa: 'kaisa',
  cass: 'cassiopeia', trist: 'tristana', lulu: 'lulu', soraka: 'soraka',
  jarvan: 'jarvaniv', renek: 'renekton', nasus: 'nasus', wu: 'wukong',
  mumu: 'amumu', ez4: 'ezreal', vik: 'viktor', zil: 'zilean',
}

/** Turns loose user input ("leesin", "Lee Sin", "asol") into Riot's display name. */
export function resolveChampion(input: string): { id: string; name: string } | undefined {
  const cleaned = input.trim().toLowerCase()
  const stripped = cleaned.replace(/[^a-z0-9]/g, '')
  return (
    champions.get(cleaned) ??
    champions.get(stripped) ??
    (ALIASES[stripped] ? champions.get(ALIASES[stripped]!) : undefined)
  )
}

export function championIcon(idOrName: string): string {
  const champ = resolveChampion(idOrName)
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champ?.id ?? idOrName}.png`
}
