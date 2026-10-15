import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PR_TITLE, git, pullRequestBody, syncUpstream } from './upstream-sync.mjs'

/**
 * @param {string} root
 * @param {string} name
 */
function repo(root, name) {
  const dir = join(root, name)
  git(root, ['init', '-b', 'main', dir])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'Test'])
  return dir
}

/**
 * @param {string} dir
 * @param {string} name
 * @param {string} content
 * @param {string} message
 */
function commitFile(dir, name, content, message) {
  writeFileSync(join(dir, name), content)
  git(dir, ['add', name])
  git(dir, ['commit', '-m', message])
}

/**
 * Fork worktree whose origin is a bare clone, starting from the upstream history.
 * @param {string} root
 */
function forkOf(root) {
  const upstream = repo(root, 'upstream')
  commitFile(upstream, 'shared.txt', 'base\n', 'base')
  const work = join(root, 'work')
  git(root, ['clone', upstream, work])
  git(work, ['config', 'user.email', 'test@example.com'])
  git(work, ['config', 'user.name', 'Test'])
  const bare = join(root, 'origin.git')
  git(root, ['clone', '--bare', work, bare])
  git(work, ['remote', 'rename', 'origin', 'upstream-src'])
  git(work, ['remote', 'add', 'origin', bare])
  git(work, ['push', '-u', 'origin', 'main'])
  commitFile(work, 'FORK.md', 'fork only\n', 'fork only')
  git(work, ['push', 'origin', 'main'])
  return { upstream, work, bare }
}

test('merges new upstream commits and opens a pull request', async () => {
  const root = mkdtempSync(join(tmpdir(), 'upstream-sync-'))
  try {
    const { upstream, work } = forkOf(root)
    commitFile(upstream, 'new.txt', 'from upstream\n', 'upstream feature')
    /** @type {{ title: string, body: string }[]} */
    const published = []
    /** @type {string[]} */
    const dispatched = []
    const result = await syncUpstream({
      repoDir: work,
      upstreamUrl: upstream,
      publish: async (info) => {
        published.push(info)
        return { number: 7, updated: false }
      },
      dispatchCi: async (ref) => {
        dispatched.push(ref)
      },
    })
    assert.equal(result.action, 'merged')
    assert.deepEqual(result.conflictFiles, [])
    assert.equal(published.length, 1)
    assert.equal(published[0].title, PR_TITLE)
    assert.match(published[0].body, /GITHUB_TOKEN/)
    assert.match(published[0].body, /do not trigger other GitHub Actions workflows/)
    assert.match(published[0].body, /None/)
    assert.deepEqual(dispatched, ['upstream-sync'])
    assert.equal(git(work, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim(), 'upstream-sync')
    const branchFile = git(work, ['show', 'HEAD:new.txt']).stdout
    assert.match(branchFile, /from upstream/)
    const forkFile = git(work, ['show', 'HEAD:FORK.md']).stdout
    assert.match(forkFile, /fork only/)
    const onOrigin = git(join(root, 'origin.git'), ['rev-parse', '--verify', 'upstream-sync'], {
      allowFailure: true,
    })
    assert.equal(onOrigin.status, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('still opens a pull request that names the conflicting files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'upstream-sync-conflict-'))
  try {
    const { upstream, work } = forkOf(root)
    commitFile(work, 'shared.txt', 'fork edit\n', 'fork edit')
    git(work, ['push', 'origin', 'main'])
    commitFile(upstream, 'shared.txt', 'upstream edit\n', 'upstream edit')
    /** @type {{ title: string, body: string }[]} */
    const published = []
    let dispatched = 0
    const result = await syncUpstream({
      repoDir: work,
      upstreamUrl: upstream,
      publish: async (info) => {
        published.push(info)
        return { number: 8, updated: true }
      },
      dispatchCi: async () => {
        dispatched += 1
      },
    })
    assert.equal(result.action, 'conflict')
    assert.deepEqual(result.conflictFiles, ['shared.txt'])
    assert.equal(published.length, 1)
    assert.equal(published[0].title, PR_TITLE)
    assert.match(published[0].body, /shared\.txt/)
    assert.match(published[0].body, /GITHUB_TOKEN/)
    assert.equal(dispatched, 0)
    const report = git(work, ['show', 'HEAD:UPSTREAM-SYNC-CONFLICTS.md']).stdout
    assert.match(report, /shared\.txt/)
    const kept = git(work, ['show', 'HEAD:shared.txt']).stdout
    assert.match(kept, /fork edit/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('does nothing when fork main already contains upstream', async () => {
  const root = mkdtempSync(join(tmpdir(), 'upstream-sync-noop-'))
  try {
    const { upstream, work } = forkOf(root)
    let published = 0
    const result = await syncUpstream({
      repoDir: work,
      upstreamUrl: upstream,
      publish: async () => {
        published += 1
        return {}
      },
    })
    assert.equal(result.action, 'up-to-date')
    assert.equal(published, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('pull request body documents the token limitation', () => {
  const body = pullRequestBody({
    upstreamSha: 'abc123',
    conflictFiles: ['apps/shell/src/main/index.ts'],
    dispatched: true,
  })
  assert.match(body, /GITHUB_TOKEN/)
  assert.match(body, /apps\/shell\/src\/main\/index\.ts/)
  assert.match(body, /dispatches `CI`/)
})
