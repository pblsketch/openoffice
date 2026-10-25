/**
 * Collect the current growth snapshot from the GitHub API and write it to
 * docs/tracking/growth-history.json (one entry per day; a same-date run replaces
 * that day's entry) and to the summary the README badge reads.
 *
 * The workflow runs hourly so the badge follows the live numbers the site reads.
 * Unauthenticated access would be 60 requests/hour per IP, too close for hourly
 * runs on shared runner IPs, so the workflow passes its GITHUB_TOKEN.
 *
 * Usage: node tools/track-growth.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildSnapshot,
  buildSummary,
  GROWTH_HISTORY_FILE,
  GROWTH_LATEST_FILE,
  GROWTH_REPO,
  mergeSnapshot,
} from './growth-log.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HISTORY_PATH = join(ROOT, GROWTH_HISTORY_FILE)
const LATEST_PATH = join(ROOT, GROWTH_LATEST_FILE)

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''

const api = async (path) => {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub API ${path} failed: ${response.status} ${await response.text()}`)
  }
  return response.json()
}

function localDate() {
  // Name the snapshot by the local calendar day so the daily workflow and a
  // manual run on the same evening land on one entry.
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

const [releases, repo] = await Promise.all([
  api(`/repos/${GROWTH_REPO}/releases?per_page=100`),
  api(`/repos/${GROWTH_REPO}`),
])

const snapshot = buildSnapshot({
  releases,
  stars: repo.stargazers_count ?? 0,
  forks: repo.forks_count ?? 0,
  date: localDate(),
})

let history = []
try {
  history = JSON.parse(readFileSync(HISTORY_PATH, 'utf8'))
} catch {
  // first run: start a fresh history
}
writeFileSync(HISTORY_PATH, JSON.stringify(mergeSnapshot(history, snapshot), null, 2) + '\n')
writeFileSync(LATEST_PATH, JSON.stringify(buildSummary(snapshot), null, 2) + '\n')

console.log(
  `Recorded ${snapshot.date}: ${snapshot.totalDownloads} downloads ` +
    `(windows ${snapshot.installs.windows}, macos ${snapshot.installs.macos}, linux ${snapshot.installs.linux}), ` +
    `${snapshot.updateChecks} update checks, ${snapshot.stars} stars.`,
)
