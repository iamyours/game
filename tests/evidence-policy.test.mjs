import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function git(args, input) {
  const result = spawnSync('git', args, { cwd: root, input, encoding: 'utf8' });
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  return result.stdout.split('\0').filter(Boolean);
}

test('evidence policy ignores raw outputs but permits portable reports and curated screenshots', () => {
  const ignored = ['evidence/future/build.log', 'evidence/future/server.json',
    'evidence/future/server.pid', 'evidence/future/run.py', 'evidence/future/run.mjs',
    'evidence/future/frame.png', 'evidence/future/clip.webm', 'evidence/future/log.gz'];
  const allowed = ['evidence/future/nested/verification.md', 'evidence/future/nested/result.json',
    'evidence/future/source.sha256', 'evidence/zip-merge-20261114/paused.png'];
  const actual = git(['check-ignore', '--no-index', '-z', '--stdin'], [...ignored, ...allowed].join('\0') + '\0');
  assert.deepEqual(actual.sort(), ignored.sort());
});

test('tracked evidence does not bypass the ignore policy', () => {
  const tracked = git(['ls-files', '-z', '--', 'evidence']);
  assert.ok(tracked.length > 0);
  const violations = git(['check-ignore', '--no-index', '-z', '--stdin'], tracked.join('\0') + '\0');
  assert.deepEqual(violations, [], `Raw evidence must remain local: ${violations.join(', ')}`);
});

test('archive index preserves source and fingerprints without requiring local raw artifacts', () => {
  const index = JSON.parse(readFileSync(new URL('../evidence/ARCHIVE_INDEX.json', import.meta.url), 'utf8'));
  assert.equal(index.schemaVersion, 1);
  assert.match(index.sourceCommit, /^[a-f0-9]{40}$/);
  assert.match(index.archive.sha256, /^[a-f0-9]{64}$/);
  assert.equal(index.before.files, index.retainedBeforeNewReports.files + index.archived.length);
  assert.equal(new Set(index.archived.map(item => item.path)).size, index.archived.length);
  for (const item of index.archived) {
    assert.ok(item.path.startsWith('evidence/') && !item.path.split('/').includes('..'));
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(item.bytes) && item.bytes >= 0);
  }
});
