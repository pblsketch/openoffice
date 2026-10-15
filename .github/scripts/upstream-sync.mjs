// Daily merge of pblsketch/openoffice main onto this fork.
// Pull requests opened with GITHUB_TOKEN do not start other workflows, so the
// caller dispatches CI after the branch is pushed.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const PR_TITLE = 'Upstream sync from pblsketch/openoffice'
export const CONFLICT_REPORT = 'UPSTREAM-SYNC-CONFLICTS.md'

const BOT_ENV = {
  GIT_AUTHOR_NAME: 'github-actions[bot]',
  GIT_AUTHOR_EMAIL: 'github-actions[bot]@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'github-actions[bot]',
  GIT_COMMITTER_EMAIL: 'github-actions[bot]@users.noreply.github.com',
}

/**
 * @param {string} cwd
 * @param {string[]} args
 * @param {{ allowFailure?: boolean, env?: NodeJS.ProcessEnv }} [opts]
 */
export function git(cwd, args, opts = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...opts.env },
  })
  if (result.error) throw result.error
  if (result.status !== 0 && !opts.allowFailure) {
    const error = new Error(`git ${args.join(' ')} failed\n${result.stderr || result.stdout || ''}`)
    error.stdout = result.stdout
    error.stderr = result.stderr
    error.status = result.status
    throw error
  }
  return result
}

/**
 * @param {{ upstreamSha: string, conflictFiles: string[], mergeError?: string, dispatched: boolean }} info
 */
export function pullRequestBody(info) {
  const lines = [
    '## Upstream sync',
    '',
    `Fetched \`pblsketch/openoffice\` \`main\` (\`${info.upstreamSha}\`) and merged it onto this fork's \`main\` on branch \`upstream-sync\`.`,
    '',
    'This pull request is opened with `GITHUB_TOKEN`. Pull requests created by `GITHUB_TOKEN` do not trigger other GitHub Actions workflows.',
    info.dispatched
      ? 'This workflow dispatches `CI` (`ci.yml`) on `upstream-sync` so the tests still run.'
      : 'CI was not dispatched. Run the CI workflow on `upstream-sync` by hand.',
    '',
    '### Conflicts',
    '',
  ]
  if (info.mergeError && info.conflictFiles.length === 0) {
    lines.push(
      'The merge failed before a file conflict list was available. Fork `main` was not changed.',
      '',
      '```',
      info.mergeError.trim(),
      '```',
    )
  } else if (info.conflictFiles.length === 0) {
    lines.push('None. The merge commit is on this branch.')
  } else {
    lines.push(
      'The merge did not complete. This branch is fork `main` plus the report below, so the conflict list stays reviewable. The conflicting files are:',
      '',
      ...info.conflictFiles.map((file) => `- \`${file}\``),
      '',
      'Resolve them on `upstream-sync`. Nothing on either side was overwritten.',
    )
  }
  return `${lines.join('\n')}\n`
}

/**
 * @param {{ upstreamSha: string, conflictFiles: string[], mergeError?: string }} info
 */
export function conflictReport(info) {
  const files =
    info.conflictFiles.length > 0
      ? info.conflictFiles.map((file) => `- ${file}`).join('\n')
      : '- (no unmerged paths; see the error below)'
  const error = info.mergeError?.trim()
    ? `\n\n## Merge error\n\n\`\`\`\n${info.mergeError.trim()}\n\`\`\`\n`
    : ''
  return `# Upstream sync conflicts\n\nUpstream \`pblsketch/openoffice\` \`main\` \`${info.upstreamSha}\` did not merge cleanly onto fork \`main\`.\n\n## Files\n\n${files}\n${error}`
}

/**
 * @param {object} options
 * @param {string} options.repoDir
 * @param {string} options.upstreamUrl
 * @param {string} [options.baseBranch]
 * @param {string} [options.syncBranch]
 * @param {string} [options.remote]
 * @param {boolean} [options.push]
 * @param {(info: { title: string, body: string, branch: string, base: string }) => Promise<{ number?: number, url?: string, updated?: boolean }>} [options.publish]
 * @param {(ref: string) => Promise<void>} [options.dispatchCi]
 */
export async function syncUpstream(options) {
  const repoDir = options.repoDir
  const baseBranch = options.baseBranch ?? 'main'
  const syncBranch = options.syncBranch ?? 'upstream-sync'
  const remote = options.remote ?? 'origin'
  const upstreamRef = `upstream/${baseBranch}`

  git(repoDir, ['fetch', remote, baseBranch])
  git(repoDir, [
    'fetch',
    '--no-tags',
    options.upstreamUrl,
    `+refs/heads/${baseBranch}:refs/remotes/${upstreamRef}`,
  ])

  const ancestor = git(
    repoDir,
    ['merge-base', '--is-ancestor', upstreamRef, `${remote}/${baseBranch}`],
    {
      allowFailure: true,
    },
  )
  if (ancestor.status === 0) {
    return { action: 'up-to-date', conflictFiles: [], upstreamSha: '' }
  }

  const upstreamSha = git(repoDir, ['rev-parse', upstreamRef]).stdout.trim()
  git(repoDir, ['checkout', '-B', syncBranch, `${remote}/${baseBranch}`])

  const merge = git(repoDir, ['merge', '--no-edit', '--no-ff', upstreamRef], {
    allowFailure: true,
    env: BOT_ENV,
  })

  /** @type {string[]} */
  let conflictFiles = []
  /** @type {string | undefined} */
  let mergeError
  if (merge.status !== 0) {
    mergeError = `${merge.stderr || ''}${merge.stdout || ''}`.trim()
    const unmerged = git(repoDir, ['diff', '--name-only', '--diff-filter=U'], {
      allowFailure: true,
    })
    conflictFiles = (unmerged.stdout || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    git(repoDir, ['merge', '--abort'], { allowFailure: true })
    writeFileSync(
      join(repoDir, CONFLICT_REPORT),
      conflictReport({ upstreamSha, conflictFiles, mergeError }),
    )
    git(repoDir, ['add', CONFLICT_REPORT])
    git(repoDir, ['commit', '-m', 'Report upstream merge conflicts'], { env: BOT_ENV })
  }

  if (options.push !== false) {
    const pushed = git(
      repoDir,
      ['push', '--force-with-lease', remote, `${syncBranch}:${syncBranch}`],
      {
        allowFailure: true,
      },
    )
    if (pushed.status !== 0) {
      git(repoDir, ['push', '-u', remote, `${syncBranch}:${syncBranch}`])
    }
  }

  const dispatched = Boolean(options.dispatchCi) && conflictFiles.length === 0 && !mergeError
  const body = pullRequestBody({ upstreamSha, conflictFiles, mergeError, dispatched })
  let published = null
  if (options.publish) {
    published = await options.publish({
      title: PR_TITLE,
      body,
      branch: syncBranch,
      base: baseBranch,
    })
  }
  if (options.dispatchCi && conflictFiles.length === 0 && !mergeError) {
    await options.dispatchCi(syncBranch)
  }

  return {
    action: conflictFiles.length > 0 || mergeError ? 'conflict' : 'merged',
    conflictFiles,
    upstreamSha,
    mergeError,
    body,
    published,
  }
}

function gh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `gh ${args.join(' ')} failed`)
  }
  return result.stdout
}

/**
 * @param {{ title: string, body: string, branch: string, base: string, repo: string }} info
 */
export async function publishWithGh(info) {
  const listed = gh([
    'pr',
    'list',
    '--repo',
    info.repo,
    '--head',
    info.branch,
    '--base',
    info.base,
    '--state',
    'open',
    '--json',
    'number',
  ])
  const existing = JSON.parse(listed)
  const dir = mkdtempSync(join(tmpdir(), 'upstream-sync-body-'))
  const bodyFile = join(dir, 'body.md')
  try {
    writeFileSync(bodyFile, info.body)
    if (Array.isArray(existing) && existing.length > 0 && typeof existing[0].number === 'number') {
      gh([
        'pr',
        'edit',
        String(existing[0].number),
        '--repo',
        info.repo,
        '--title',
        info.title,
        '--body-file',
        bodyFile,
      ])
      return { number: existing[0].number, updated: true }
    }
    const url = gh([
      'pr',
      'create',
      '--repo',
      info.repo,
      '--base',
      info.base,
      '--head',
      info.branch,
      '--title',
      info.title,
      '--body-file',
      bodyFile,
    ]).trim()
    return { url, updated: false }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  const repo = process.env.GH_REPO || ''
  const result = await syncUpstream({
    repoDir: process.env.REPO_DIR || process.cwd(),
    upstreamUrl: process.env.UPSTREAM_URL || 'https://github.com/pblsketch/openoffice.git',
    baseBranch: process.env.BASE_BRANCH || 'main',
    syncBranch: process.env.SYNC_BRANCH || 'upstream-sync',
    remote: process.env.GIT_REMOTE || 'origin',
    push: process.env.DRY_RUN !== '1',
    publish: repo
      ? (info) => publishWithGh({ ...info, repo })
      : async () => {
          throw new Error('GH_REPO is required to open the pull request')
        },
    dispatchCi: repo
      ? async (ref) => {
          gh(['workflow', 'run', 'ci.yml', '--repo', repo, '--ref', ref])
        }
      : undefined,
  })
  if (result.action === 'up-to-date') {
    console.log('upstream sync: fork main already contains upstream main')
    return
  }
  console.log(
    `upstream sync: ${result.action} ${result.upstreamSha}` +
      (result.conflictFiles?.length ? ` conflicts=${result.conflictFiles.join(',')}` : ''),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}

export function readConflictReport(repoDir) {
  return readFileSync(join(repoDir, CONFLICT_REPORT), 'utf8')
}
