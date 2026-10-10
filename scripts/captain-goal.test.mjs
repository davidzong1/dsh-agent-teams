import assert from 'node:assert/strict'
import test from 'node:test'
import { installCaptainGoalPolicy, isAutomaticGoalRound, isCaptainGoalWake } from '../lib/captain-goal.js'

function flush() {
  return new Promise(resolve => setImmediate(resolve))
}

function harness() {
  const listeners = new Map()
  const calls = []
  const agent = { id: 'captain', session: { header: { cwd: '/tmp' } } }
  const goals = {
    current: undefined,
    get() { return this.current },
    resume(_agent, ref) {
      this.current = { ...this.current, id: ref.id, revision: ref.revision, phase: 'active', activation: 'armed' }
      calls.push('resume')
      return this.current
    },
    disarm() {
      this.current = { ...this.current, activation: 'disarmed' }
      calls.push('disarm')
      return this.current
    },
  }
  const ctx = {
    agents: { get(id) { return id === agent.id ? agent : undefined } },
    get(name) { return name === 'goals' ? goals : undefined },
    on(name, fn) {
      const list = listeners.get(name) ?? []
      list.push(fn)
      listeners.set(name, list)
      return () => {}
    },
    logger: { warn() {} },
  }
  const policy = installCaptainGoalPolicy(ctx, '.agent-teams')
  const emit = (name, ...args) => {
    for (const fn of listeners.get(name) ?? []) fn(...args)
  }
  return { policy, goals, calls, emit, agent }
}

test('captain goal wakes are user input and member reports', () => {
  assert.equal(isCaptainGoalWake({ kind: 'user' }), true)
  assert.equal(isCaptainGoalWake({ kind: 'agent-teams' }), true)
  assert.equal(isCaptainGoalWake({ kind: 'agent-teams-command' }), true)
  assert.equal(isCaptainGoalWake({ kind: 'goal', round: 2 }), false)
  assert.equal(isCaptainGoalWake(undefined), false)
  assert.equal(isAutomaticGoalRound({ kind: 'goal', round: 1 }), true)
  assert.equal(isAutomaticGoalRound({ kind: 'goal', round: 0 }), false)
  assert.equal(isAutomaticGoalRound({ kind: 'user' }), false)
})

test('a captain goal stays disarmed until one wake, then stops after that round', async () => {
  const { policy, goals, calls, emit, agent } = harness()
  policy.noteCaptain(agent.id)
  goals.current = { id: 'g', revision: 1, phase: 'active', activation: 'armed' }
  emit('session/event', { id: agent.id }, { type: 'goal/change', data: {} })
  await flush()
  assert.deepEqual(calls, ['disarm'])
  assert.equal(goals.current.activation, 'disarmed')

  emit('session/event', { id: agent.id }, { type: 'user/message', data: { source: { kind: 'agent-teams' } } })
  await flush()
  emit('session/event', { id: agent.id }, { type: 'goal/change', data: {} })
  await flush()
  assert.equal(goals.current.activation, 'armed')
  assert.deepEqual(calls, ['disarm', 'resume'])

  emit('agent/status', { agent, status: 'idle' })
  assert.equal(goals.current.activation, 'armed')
  emit('session/event', { id: agent.id }, { type: 'user/message', data: { source: { kind: 'goal', round: 1 } } })
  assert.equal(goals.current.activation, 'disarmed')
  emit('agent/status', { agent, status: 'idle' })
  assert.equal(goals.current.activation, 'disarmed')
  assert.deepEqual(calls, ['disarm', 'resume', 'disarm'])
})

test('aborting the conversation does not leave a captain goal armed', async () => {
  const { policy, goals, calls, emit, agent } = harness()
  policy.noteCaptain(agent.id)
  goals.current = { id: 'g', revision: 1, phase: 'active', activation: 'disarmed' }
  emit('session/event', { id: agent.id }, { type: 'user/message', data: { source: { kind: 'user' } } })
  await flush()
  assert.equal(goals.current.activation, 'armed')
  emit('session/event', { id: agent.id }, { type: 'turn/end', data: { reason: { kind: 'aborted' } } })
  assert.equal(goals.current.activation, 'disarmed')
  emit('agent/status', { agent, status: 'idle' })
  assert.equal(goals.current.activation, 'disarmed')
  assert.deepEqual(calls, ['resume', 'disarm'])
})
