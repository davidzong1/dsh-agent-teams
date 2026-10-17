import assert from 'node:assert/strict'
import test from 'node:test'
import { finishedGoalMatches, installMemberTaskGoal, memberTaskObjective, releaseFinishedMemberGoal, releaseMemberTaskGoal } from '../lib/member-goal.js'

test('task objective prefers the explicit objective, then subject and description', () => {
  assert.equal(memberTaskObjective({ subject: 'Title', objective: ' Ship it ' }), 'Ship it')
  assert.equal(memberTaskObjective({ subject: 'Title', description: ' details ' }), 'Title\ndetails')
  assert.equal(memberTaskObjective({ subject: ' Title ' }), 'Title')
})

test('installs a fresh goal and replaces a different current goal', () => {
  const member = { id: 'member' }
  const goals = []
  const api = {
    current: undefined,
    get() { return this.current },
    create(_agent, request) {
      this.current = { id: 'goal-1', revision: 1, phase: 'active', activation: 'armed', objective: request.objective }
      goals.push(['create', request.objective])
      return this.current
    },
    edit(_agent, ref, request) {
      this.current = { ...this.current, id: ref.id, revision: ref.revision + 1, objective: request.objective }
      goals.push(['edit', request.objective])
      return this.current
    },
    resume(_agent, ref) {
      this.current = { ...this.current, revision: ref.revision, phase: 'active', activation: 'armed' }
      goals.push(['resume'])
      return this.current
    },
    disarm() {
      this.current = { ...this.current, activation: 'disarmed' }
      goals.push(['disarm'])
      return this.current
    },
  }
  const ctx = { get(name) { return name === 'goals' ? api : undefined } }
  installMemberTaskGoal(ctx, member, 'first')
  installMemberTaskGoal(ctx, member, 'first')
  api.current = { ...api.current, phase: 'paused', activation: 'disarmed' }
  installMemberTaskGoal(ctx, member, 'second')
  api.current = { ...api.current, phase: 'complete', activation: 'disarmed' }
  installMemberTaskGoal(ctx, member, 'third')
  assert.deepEqual(goals, [
    ['create', 'first'],
    ['edit', 'second'],
    ['resume'],
    ['create', 'third'],
  ])
  installMemberTaskGoal({ get() { return undefined } }, member, 'ignored')
  installMemberTaskGoal(ctx, member, 'third', { arm: false })
  assert.deepEqual(goals.at(-1), ['disarm'])
  assert.equal(api.current.activation, 'disarmed')
  api.current = undefined
  installMemberTaskGoal(ctx, member, 'passive', { arm: false })
  assert.deepEqual(goals.slice(-2), [['create', 'passive'], ['disarm']])
})

test('a failed task clears only the matching member goal', () => {
  const member = { id: 'member' }
  const calls = []
  const api = {
    current: { id: 'goal-1', revision: 4, phase: 'active', activation: 'armed', objective: 'Ship it' },
    get() { return this.current },
    clear(_agent, ref) {
      calls.push(['clear', ref.id, ref.revision])
      this.current = undefined
      return { id: ref.id, revision: ref.revision + 1 }
    },
  }
  const ctx = { get(name) { return name === 'goals' ? api : undefined } }
  releaseMemberTaskGoal(ctx, member, 'Other work')
  assert.equal(api.current.objective, 'Ship it')
  releaseMemberTaskGoal(ctx, member, ' Ship it ')
  assert.equal(api.current, undefined)
  assert.deepEqual(calls, [['clear', 'goal-1', 4]])
  releaseMemberTaskGoal(ctx, member, 'Ship it')
  releaseMemberTaskGoal({ get() { return undefined } }, member, 'Ship it')
  assert.deepEqual(calls, [['clear', 'goal-1', 4]])
})

test('an idle member drops a goal whose task is already complete', () => {
  const task = { assignee: 'ada', status: 'completed', subject: 'Ship it' }
  assert.equal(finishedGoalMatches([task], 'ada', 'Ship it'), true)
  assert.equal(finishedGoalMatches([{ ...task, status: 'pending' }], 'ada', 'Ship it'), false)
  assert.equal(finishedGoalMatches([task, { assignee: 'ada', status: 'pending', subject: 'Ship it' }], 'ada', 'Ship it'), false)
  const member = { id: 'member' }
  const calls = []
  const api = {
    current: { id: 'goal-1', revision: 2, phase: 'active', activation: 'armed', objective: 'Ship it' },
    get() { return this.current },
    clear(_agent, ref) {
      calls.push(ref.id)
      this.current = undefined
      return { id: ref.id, revision: ref.revision + 1 }
    },
  }
  assert.equal(releaseFinishedMemberGoal({ get(name) { return name === 'goals' ? api : undefined } }, member, [task], 'ada'), true)
  assert.equal(api.current, undefined)
  assert.deepEqual(calls, ['goal-1'])
  assert.equal(releaseFinishedMemberGoal({ get(name) { return name === 'goals' ? api : undefined } }, member, [task], 'ada'), false)
})
