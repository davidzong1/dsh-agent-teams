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
const TERMINAL_GOAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
/**
 * A member goal should stop when its text belongs to a finished task and to
 * no task that is still open for that member.
 */
export function finishedGoalMatches(tasks, memberName, goalObjective) {
    const text = goalObjective.trim();
    if (text === '')
        return false;
    if (tasks.some(task => task.assignee === memberName && !TERMINAL_GOAL_STATUSES.has(task.status) && memberTaskObjective(task) === text))
        return false;
    return tasks.some(task => task.assignee === memberName && TERMINAL_GOAL_STATUSES.has(task.status) && memberTaskObjective(task) === text);
}
/**
 * Remove the member's current `/goal` when it is the objective of a task that
 * has been completed, failed, or cancelled. A different current goal is left in place.
 * After this, the round driver has no armed goal to queue.
 */
export function releaseMemberTaskGoal(ctx, member, objective) {
    const text = objective.trim();
    if (text === '')
        return;
    const goals = goalsOf(ctx);
    if (goals === undefined)
        return;
    const current = goals.get(member);
    if (current === undefined || current.objective !== text)
        return;
    goals.clear(member, { id: current.id, revision: current.revision });
}
/**
 * Clear a live member's goal when every matching task is already terminal.
 * @returns whether a goal was cleared.
 */
export function releaseFinishedMemberGoal(ctx, member, tasks, memberName) {
    const goals = goalsOf(ctx);
    if (goals === undefined)
        return false;
    const current = goals.get(member);
    if (current === undefined || !finishedGoalMatches(tasks, memberName, current.objective))
        return false;
    goals.clear(member, { id: current.id, revision: current.revision });
    return true;
}
function goalsOf(ctx) {
    return ctx.get('goals');
}
