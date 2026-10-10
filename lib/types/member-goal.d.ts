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
