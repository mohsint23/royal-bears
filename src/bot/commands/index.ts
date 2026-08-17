import { accounts } from './accounts.js'
import { help } from './help.js'
import { multi } from './multi.js'
import { pool } from './pool.js'
import { profile } from './profile.js'
import { refresh } from './refresh.js'
import { register } from './register.js'
import { scrim } from './scrim.js'
import { setkey } from './setkey.js'
import { team } from './team.js'
import type { Command } from './types.js'

export const commands: Command[] = [register, accounts, profile, team, multi, pool, scrim, help, refresh, setkey]

export const byName = new Map<string, Command>(commands.map((c) => [c.data.name, c]))
