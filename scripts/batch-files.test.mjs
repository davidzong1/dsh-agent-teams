import assert from 'node:assert/strict'
import test from 'node:test'
import { isEphemeralFileBatchRequest } from '../lib/members.js'
import { normalizeFileBatch } from '../lib/batch-files.js'

test('only a depth-zero file-tool start counts as a temporary batch', () => {
  assert.equal(isEphemeralFileBatchRequest({
    label: 'agent-teams-batch:team:worker:0',
    maxDepth: 0,
    toolFilter: { allow: ['read', 'edit'] },
  }), true)
  assert.equal(isEphemeralFileBatchRequest({
    label: 'agent-teams-batch:team:worker:0',
    maxDepth: 0,
    toolFilter: { allow: ['read', 'subagent'] },
  }), false)
  assert.equal(isEphemeralFileBatchRequest({
    label: 'agent-teams:team:worker',
    maxDepth: 0,
    toolFilter: { allow: ['read'] },
  }), false)
  assert.equal(isEphemeralFileBatchRequest({ label: 'agent-teams-batch:team:worker:0', toolFilter: { allow: ['read'] } }), false)
})

test('file batches stay small and a write requires content', () => {
  assert.equal(normalizeFileBatch([{ path: ' a.txt ', operation: 'summarize', instruction: ' sum ' }])[0].path, 'a.txt')
  assert.throws(() => normalizeFileBatch([]), /at least one file/)
  assert.throws(() => normalizeFileBatch([{ path: 'a.txt', operation: 'write', instruction: 'replace' }]), /needs content/)
  assert.throws(() => normalizeFileBatch(Array.from({ length: 9 }, (_, index) => ({
    path: `${index}.txt`, operation: 'read', instruction: 'read',
  }))), /at most 8/)
})
