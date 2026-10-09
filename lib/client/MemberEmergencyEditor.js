import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState, useSyncExternalStore } from 'react';
import css from './ActivityPanel.module.css';
/** Edits the durable quota-only route without changing the captain's model. */
export function MemberEmergencyEditor({ team, member, directory, t }) {
    const catalog = useSyncExternalStore(directory.store.subscribe, directory.store.getSnapshot);
    useEffect(() => { void directory.load().catch(() => undefined); }, [directory]);
    const configured = member.emergencyFallback;
    const [savedRoute, setSavedRoute] = useState(configured);
    const [selection, setSelection] = useState(configured ? JSON.stringify([configured.provider, configured.model]) : '');
    useEffect(() => {
        setSavedRoute(configured);
        setSelection(configured ? JSON.stringify([configured.provider, configured.model]) : '');
    }, [configured?.provider, configured?.model]);
    const [pending, setPending] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [failed, setFailed] = useState(false);
    const routes = catalog.groups.flatMap(group => group.models.map(model => ({
        key: JSON.stringify([group.id, model.id]), provider: group.id, model: model.id,
        label: `${group.name} / ${model.name}`,
    }))).filter(route => route.provider !== member.provider || route.model !== member.model);
    const save = async (clear) => {
        const route = routes.find(item => item.key === selection);
        if (!clear && route === undefined)
            return;
        setPending(true);
        setFeedback('');
        try {
            const response = await fetch('/plugins/dsh-agent-teams/member-emergency', {
                method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ sessionId: team.captainSessionId, teamId: team.teamId,
                    memberId: member.id, memberName: member.name,
                    emergencyFallback: clear ? null : { provider: route.provider, model: route.model } }),
            });
            if (!response.ok) {
                const body = await response.json();
                throw new Error(body.error ?? `HTTP ${response.status}`);
            }
            const body = await response.json();
            const saved = body.emergencyFallback ?? undefined;
            setSavedRoute(saved);
            setSelection(saved ? JSON.stringify([saved.provider, saved.model]) : '');
            setFailed(false);
            setFeedback(t(clear ? 'emergency.cleared' : 'emergency.saved'));
        }
        catch (error) {
            setFailed(true);
            setFeedback(error instanceof Error ? error.message : String(error));
        }
        finally {
            setPending(false);
        }
    };
    return (_jsxs("details", { className: css.emergencyEditor, "data-member-emergency": member.name, children: [_jsxs("summary", { children: [t('emergency.title'), member.fallbackActive && ` · ${t('emergency.active')}`] }), _jsx("p", { children: t('emergency.help') }), _jsxs("p", { children: [t('emergency.current'), ": ", member.provider, "/", member.model] }), _jsxs("p", { children: [t('emergency.backup'), ": ", savedRoute
                        ? `${savedRoute.provider}/${savedRoute.model}` : t('emergency.none')] }), (catalog.status === 'error' || catalog.failures.length > 0) && (_jsx("button", { type: "button", disabled: pending, onClick: () => { void directory.load().catch(() => undefined); }, children: t('workspace.retry') })), _jsxs("label", { children: [t('emergency.backup'), _jsxs("select", { value: selection, disabled: pending, onChange: event => setSelection(event.target.value), children: [_jsx("option", { value: "", children: t('plan.model.choose') }), routes.map(route => _jsx("option", { value: route.key, children: route.label }, route.key))] })] }), _jsxs("div", { children: [_jsx("button", { type: "button", disabled: pending || !routes.some(route => route.key === selection), onClick: () => void save(false), children: t('emergency.save') }), _jsx("button", { type: "button", disabled: pending || savedRoute === undefined, onClick: () => void save(true), children: t('emergency.clear') })] }), feedback && _jsx("p", { role: failed ? 'alert' : 'status', children: feedback })] }));
}
