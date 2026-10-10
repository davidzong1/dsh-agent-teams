/**
 * Install one published task as the assignee's same-session `/goal`.
 *
 * The goal service is optional. A profile without it still delivers the task.
 */
/** The text a published task should leave in the member's `/goal`. */
export function memberTaskObjective(task) {
    const objective = task.objective?.trim();
    if (objective !== undefined && objective !== '')
        return objective;
    const description = task.description?.trim();
    return description === undefined || description === '' ? task.subject.trim() : `${task.subject.trim()}\n${description}`;
}
/**
 * Create or replace one agent's current goal.
 * `arm: false` keeps the durable goal but does not queue automatic rounds.
 * An already active goal with the same text and the requested activation is left in place.
 */
export function installMemberTaskGoal(ctx, member, objective, options) {
    const text = objective.trim();
    if (text === '')
        return;
    const goals = goalsOf(ctx);
    if (goals === undefined)
        return;
    const arm = options?.arm !== false;
    const current = goals.get(member);
    if (current !== undefined && current.objective === text && current.phase === 'active') {
        if (arm) {
            if (current.activation !== 'armed')
                goals.resume(member, { id: current.id, revision: current.revision });
            return;
        }
        if (current.activation === 'armed')
            goals.disarm(member);
        return;
    }
    if (current === undefined || current.phase === 'complete') {
        goals.create(member, { objective: text });
    }
    else {
        const edited = goals.edit(member, { id: current.id, revision: current.revision }, { objective: text });
        if (arm && (edited.phase !== 'active' || edited.activation !== 'armed')) {
            goals.resume(member, { id: edited.id, revision: edited.revision });
        }
    }
    if (!arm && goals.get(member)?.activation === 'armed')
        goals.disarm(member);
}
function goalsOf(ctx) {
    return ctx.get('goals');
}
