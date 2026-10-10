import assert from 'node:assert/strict'
import test from 'node:test'
import { installMemberTaskGoal, memberTaskObjective } from '../lib/member-goal.js'

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
