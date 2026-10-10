/**
 * Keep a team captain's `/goal` passive.
 *
 * The host round driver queues another round whenever an armed goal's agent
 * becomes idle, including after the conversation is interrupted. A captain
 * goal stays disarmed until a user message or a member report permits exactly
 * one following round.
 */
import { join } from 'node:path';
import { findTeamByCaptain } from "./state.js";
/** Sources that may release one captain goal round. Goal rounds themselves do not. */
export function isCaptainGoalWake(source) {
    return source?.kind === 'user' || source?.kind === 'agent-teams' || source?.kind === 'agent-teams-command';
}
/** Positive-numbered host continuation, as opposed to a human or member message. */
export function isAutomaticGoalRound(source) {
    return source?.kind === 'goal' && typeof source.round === 'number' && source.round > 0;
}
/**
 * Disarm the captain goal except across one permitted idle edge.
 * The host driver reads activation synchronously on idle, so the permit must
 * still be set when that idle begins and is consumed there.
 */
export function installCaptainGoalPolicy(ctx, stateDir) {
    const captains = new Set();
    const permit = new Set();
    const roundInFlight = new Set();
    const noteCaptain = (sessionId) => {
        captains.add(sessionId);
    };
    const goalsOf = () => ctx.get('goals');
    const disarm = (agent) => {
        const goals = goalsOf();
        if (goals?.get(agent)?.activation === 'armed')
            goals.disarm(agent);
    };
    const arm = (agent) => {
        permit.add(agent.id);
        const goals = goalsOf();
        const current = goals?.get(agent);
        if (goals === undefined || current === undefined || current.phase === 'complete')
            return;
        if (current.phase === 'active' && current.activation === 'armed')
            return;
        try {
            goals.resume(agent, { id: current.id, revision: current.revision });
        }
        catch (error) {
            permit.delete(agent.id);
            ctx.logger?.warn(`agent-teams: could not arm the captain /goal for "${agent.id}": ${String(error)}`);
        }
    };
    const agentOf = (sessionId) => ctx.agents.get(sessionId);
    async function resolveCaptain(sessionId) {
        const agent = agentOf(sessionId);
        if (agent === undefined)
            return undefined;
        if (captains.has(agent.id))
            return agent;
        const team = await findTeamByCaptain(join(agent.session.header.cwd ?? process.cwd(), stateDir), agent.id);
        if (team === undefined)
            return undefined;
        captains.add(agent.id);
        return agent;
    }
    /** Drop an arm that the host just committed, after that commit finishes. */
    const scheduleDisarm = (sessionId) => {
        const run = () => {
            if (permit.has(sessionId) || roundInFlight.has(sessionId))
                return;
            const agent = agentOf(sessionId);
            if (agent === undefined || !captains.has(agent.id))
                return;
            disarm(agent);
        };
        if (captains.has(sessionId))
            queueMicrotask(run);
        else
            void resolveCaptain(sessionId).then(agent => {
                if (agent !== undefined)
                    queueMicrotask(run);
            }).catch((error) => {
                ctx.logger?.warn(`agent-teams: could not settle the captain /goal for "${sessionId}": ${String(error)}`);
            });
    };
    ctx.on('session/event', (session, event) => {
        if (event.type === 'goal/change') {
            scheduleDisarm(session.id);
            return;
        }
        if (event.type === 'turn/end' && event.data.reason.kind === 'aborted') {
            permit.delete(session.id);
            roundInFlight.delete(session.id);
            const agent = agentOf(session.id);
            if (agent !== undefined && captains.has(agent.id))
                disarm(agent);
            return;
        }
        if (event.type !== 'user/message')
            return;
        const source = event.data.source;
        if (isAutomaticGoalRound(source)) {
            permit.delete(session.id);
            roundInFlight.delete(session.id);
            const agent = agentOf(session.id);
            if (agent !== undefined && captains.has(agent.id))
                disarm(agent);
            return;
        }
        if (!isCaptainGoalWake(source))
            return;
        void resolveCaptain(session.id).then(agent => {
            if (agent !== undefined)
                arm(agent);
        }).catch((error) => {
            ctx.logger?.warn(`agent-teams: could not wake the captain /goal for "${session.id}": ${String(error)}`);
        });
    });
    ctx.on('agent/status', ({ agent, status }) => {
        if (status !== 'idle')
            return;
        if (!captains.has(agent.id)) {
            void resolveCaptain(agent.id).then(found => {
                if (found === undefined || permit.has(found.id) || roundInFlight.has(found.id))
                    return;
                disarm(found);
            }).catch((error) => {
                ctx.logger?.warn(`agent-teams: could not disarm the captain /goal for "${agent.id}": ${String(error)}`);
            });
            return;
        }
        if (roundInFlight.has(agent.id)) {
            roundInFlight.delete(agent.id);
            disarm(agent);
            return;
        }
        if (permit.has(agent.id)) {
            permit.delete(agent.id);
            roundInFlight.add(agent.id);
            return;
        }
        disarm(agent);
    });
    return { noteCaptain };
}
