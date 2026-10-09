import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ModelDirectory } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { ActivityMember, ActivityTeam } from './activity-monitor.ts'
import type { AgentTeamsTranslate } from './locales.ts'
import css from './ActivityPanel.module.css'

/** Edits the durable quota-only route without changing the captain's model. */
export function MemberEmergencyEditor({ team, member, directory, t }: {
  readonly team: ActivityTeam
  readonly member: ActivityMember
  readonly directory: ModelDirectory
  readonly t: AgentTeamsTranslate
}) {
  const catalog = useSyncExternalStore(directory.store.subscribe, directory.store.getSnapshot)
  useEffect(() => { void directory.load().catch(() => undefined) }, [directory])
  const configured = member.emergencyFallback
  const [savedRoute, setSavedRoute] = useState(configured)
  const [selection, setSelection] = useState(configured ? JSON.stringify([configured.provider, configured.model]) : '')
  useEffect(() => {
    setSavedRoute(configured)
    setSelection(configured ? JSON.stringify([configured.provider, configured.model]) : '')
  }, [configured?.provider, configured?.model])
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [failed, setFailed] = useState(false)
  const routes = catalog.groups.flatMap(group => group.models.map(model => ({
    key: JSON.stringify([group.id, model.id]), provider: group.id, model: model.id,
    label: `${group.name} / ${model.name}`,
  }))).filter(route => route.provider !== member.provider || route.model !== member.model)
  const save = async (clear: boolean): Promise<void> => {
    const route = routes.find(item => item.key === selection)
    if (!clear && route === undefined) return
    setPending(true)
    setFeedback('')
    try {
      const response = await fetch('/plugins/dsh-agent-teams/member-emergency', {
        method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: team.captainSessionId, teamId: team.teamId,
          memberId: member.id, memberName: member.name,
          emergencyFallback: clear ? null : { provider: route!.provider, model: route!.model } }),
      })
      if (!response.ok) {
        const body = await response.json() as { error?: string }
        throw new Error(body.error ?? `HTTP ${response.status}`)
      }
      const body = await response.json() as { emergencyFallback: { provider: string; model: string } | null }
      const saved = body.emergencyFallback ?? undefined
      setSavedRoute(saved)
      setSelection(saved ? JSON.stringify([saved.provider, saved.model]) : '')
      setFailed(false)
      setFeedback(t(clear ? 'emergency.cleared' : 'emergency.saved'))
    } catch (error) {
      setFailed(true)
      setFeedback(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <details className={css.emergencyEditor} data-member-emergency={member.name}>
      <summary>{t('emergency.title')}{member.fallbackActive && ` · ${t('emergency.active')}`}</summary>
      <p>{t('emergency.help')}</p>
      <p>{t('emergency.current')}: {member.provider}/{member.model}</p>
      <p>{t('emergency.backup')}: {savedRoute
        ? `${savedRoute.provider}/${savedRoute.model}` : t('emergency.none')}</p>
      {(catalog.status === 'error' || catalog.failures.length > 0) && (
        <button type="button" disabled={pending} onClick={() => { void directory.load().catch(() => undefined) }}>{t('workspace.retry')}</button>
      )}
      <label>
        {t('emergency.backup')}
        <select value={selection} disabled={pending} onChange={event => setSelection(event.target.value)}>
          <option value="">{t('plan.model.choose')}</option>
          {routes.map(route => <option key={route.key} value={route.key}>{route.label}</option>)}
        </select>
      </label>
      <div>
        <button type="button" disabled={pending || !routes.some(route => route.key === selection)} onClick={() => void save(false)}>{t('emergency.save')}</button>
        <button type="button" disabled={pending || savedRoute === undefined} onClick={() => void save(true)}>{t('emergency.clear')}</button>
      </div>
      {feedback && <p role={failed ? 'alert' : 'status'}>{feedback}</p>}
    </details>
  )
}
