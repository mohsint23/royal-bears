/**
 * Writes the applicants spreadsheet to disk from the local database.
 *
 *   npm run export-applicants [out.xlsx]
 *
 * The Railway bot holds the live data; use /applicants in Discord for that.
 */
import { writeFileSync } from 'node:fs'
import { applicantsFilename, applicantsWorkbook } from './bot/applicants.js'

const out = process.argv[2] || applicantsFilename()
writeFileSync(out, await applicantsWorkbook())
console.log(`Wrote ${out}`)
