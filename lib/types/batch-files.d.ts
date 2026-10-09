/**
 * Temporary file workers for team members.
 *
 * Each file is a one-shot `subagents.start`. The run is disposed when it
 * finishes, so the worker is not a continuable team member and cannot be
 * resumed. File tools are the only tools the child keeps.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
export interface FileBatchItem {
    path: string;
    operation: 'read' | 'write' | 'summarize';
    instruction: string;
    content?: string;
}
export interface FileBatchResult {
    path: string;
    operation: FileBatchItem['operation'];
    stop_reason: string;
    output: string;
}
/** Reject a batch that is empty, too large, or missing a write body. */
export declare function normalizeFileBatch(files: readonly FileBatchItem[]): FileBatchItem[];
/**
 * Run one disposable file worker per item and return their text results.
 * @param ctx - plugin context (`subagents`).
 * @param providerName - the same one-shot-capable provider used for members.
 * @param parent - the member agent that owns this batch.
 * @param teamId - team id, recorded only in the temporary label.
 * @param memberName - member name, recorded only in the temporary label.
 * @param files - validated file jobs.
 * @param signal - the tool call's cancellation signal.
 */
export declare function runEphemeralFileBatch(ctx: Context, providerName: string, parent: Agent, teamId: string, memberName: string, files: readonly FileBatchItem[], signal: AbortSignal): Promise<FileBatchResult[]>;
