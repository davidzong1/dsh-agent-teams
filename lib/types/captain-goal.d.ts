/**
 * Keep a team captain's `/goal` passive.
 *
 * The host round driver queues another round whenever an armed goal's agent
 * becomes idle, including after the conversation is interrupted. A captain
 * goal stays disarmed until a user message or a member report permits exactly
 * one following round.
 */
import type { Context } from '@deepseek-ai/cordis';
/** Sources that may release one captain goal round. Goal rounds themselves do not. */
export declare function isCaptainGoalWake(source: {
    readonly kind?: string;
} | undefined): boolean;
/** Positive-numbered host continuation, as opposed to a human or member message. */
export declare function isAutomaticGoalRound(source: {
    readonly kind?: string;
    readonly round?: number;
} | undefined): boolean;
/**
 * Disarm the captain goal except across one permitted idle edge.
 * The host driver reads activation synchronously on idle, so the permit must
 * still be set when that idle begins and is consumed there.
 */
export declare function installCaptainGoalPolicy(ctx: Context, stateDir: string): {
    noteCaptain(sessionId: string): void;
};
