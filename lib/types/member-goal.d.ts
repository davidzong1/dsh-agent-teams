/**
 * Install one published task as the assignee's same-session `/goal`.
 *
 * The goal service is optional. A profile without it still delivers the task.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
/** The text a published task should leave in the member's `/goal`. */
export declare function memberTaskObjective(task: {
    readonly objective?: string;
    readonly subject: string;
    readonly description?: string;
}): string;
/**
 * Create or replace one agent's current goal.
 * `arm: false` keeps the durable goal but does not queue automatic rounds.
 * An already active goal with the same text and the requested activation is left in place.
 */
export declare function installMemberTaskGoal(ctx: Context, member: Agent, objective: string, options?: {
    readonly arm?: boolean;
}): void;
interface GoalTask {
    readonly assignee?: string;
    readonly status: string;
    readonly objective?: string;
    readonly subject: string;
    readonly description?: string;
}
/**
 * A member goal should stop when its text belongs to a finished task and to
 * no task that is still open for that member.
 */
export declare function finishedGoalMatches(tasks: readonly GoalTask[], memberName: string, goalObjective: string): boolean;
/**
 * Remove the member's current `/goal` when it is the objective of a task that
 * has been completed, failed, or cancelled. A different current goal is left in place.
 * After this, the round driver has no armed goal to queue.
 */
export declare function releaseMemberTaskGoal(ctx: Context, member: Agent, objective: string): void;
/**
 * Clear a live member's goal when every matching task is already terminal.
 * @returns whether a goal was cleared.
 */
export declare function releaseFinishedMemberGoal(ctx: Context, member: Agent, tasks: readonly GoalTask[], memberName: string): boolean;
export {};
