/**
 * Temporary file workers for team members.
 *
 * Each file is a one-shot `subagents.start`. The run is disposed when it
 * finishes, so the worker is not a continuable team member and cannot be
 * resumed. File tools are the only tools the child keeps.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { EPHEMERAL_FILE_BATCH_LABEL } from './members.ts'
import { restrictableToolNames } from './harness-compat.ts'

const FILE_TOOLS = ['read', 'write', 'edit'] as const
const MAX_FILES = 8
const MAX_PARALLEL = 4

/**
 * The one-shot `subagents.start` contract these workers were built on. Harness
 * 0.2.1-alpha hosts advertise `toolFilter`/`depthLimit`/`persona` and accept
 * them in the start request; rc.1 replaced `start()` with managed activations
 * and dropped those start-time options, so the capability gate below rejects
 * the feature there instead of silently starting an unrestricted child.
 */
interface OneShotCapabilities {
  toolFilter?: boolean
  depthLimit?: boolean
  persona?: boolean
}

interface OneShotStartRequest {
  label: string
  parent: Agent
  signal: AbortSignal
  maxDepth: number
  toolFilter: { allow: string[] }
  persona: string
  prompt: ContentBlock[]
}

interface OneShotRun {
  result: Promise<{ stopReason: string; output: readonly ContentBlock[] }>
  dispose(): Promise<void>
}

interface OneShotBoundary {
  start?: (name: string, request: OneShotStartRequest) => Promise<OneShotRun>
}

export interface FileBatchItem {
  path: string
  operation: 'read' | 'write' | 'summarize'
  instruction: string
  content?: string
}

export interface FileBatchResult {
  path: string
  operation: FileBatchItem['operation']
  stop_reason: string
  output: string
}

/** Reject a batch that is empty, too large, or missing a write body. */
export function normalizeFileBatch(files: readonly FileBatchItem[]): FileBatchItem[] {
  if (files.length === 0) throw new Error('agent_teams_batch_files requires at least one file')
  if (files.length > MAX_FILES) throw new Error(`agent_teams_batch_files accepts at most ${MAX_FILES} files per call`)
  return files.map((file, index) => {
    const path = file.path.trim()
    const instruction = file.instruction.trim()
    if (path === '' || instruction === '') throw new Error(`file ${index + 1} needs a path and an instruction`)
    if (file.operation === 'write' && (file.content === undefined || file.content === '')) {
      throw new Error(`file ${index + 1} is a write and needs content`)
    }
    return {
      path,
      operation: file.operation,
      instruction,
      ...file.operation === 'write' ? { content: file.content } : {},
    }
  })
}

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
export async function runEphemeralFileBatch(
  ctx: Context,
  providerName: string,
  parent: Agent,
  teamId: string,
  memberName: string,
  files: readonly FileBatchItem[],
  signal: AbortSignal,
): Promise<FileBatchResult[]> {
  const provider = ctx.subagents.getProvider(providerName)
  if (provider === undefined) throw new Error(`agent-teams: no subagent provider "${providerName}" is registered`)
  const capabilities = provider.capabilities as unknown as OneShotCapabilities
  if (!capabilities.toolFilter || !capabilities.depthLimit || !capabilities.persona) {
    throw new Error(`agent-teams: provider "${providerName}" cannot start a temporary file-only worker`)
  }
  const allow = fileToolsFor(parent)
  if (allow.length === 0) throw new Error('agent_teams_batch_files needs the read, write, or edit tool')
  const results = new Array<FileBatchResult>(files.length)
  let cursor = 0
  const runNext = async (): Promise<void> => {
    for (;;) {
      const index = cursor
      cursor += 1
      const file = files[index]
      if (file === undefined) return
      results[index] = await runOne(ctx, providerName, parent, teamId, memberName, index, file, allow, signal)
    }
  }
  const workers = Math.min(MAX_PARALLEL, files.length)
  await Promise.all(Array.from({ length: workers }, () => runNext()))
  return results
}

function fileToolsFor(parent: Agent): string[] {
  const known = restrictableToolNames(parent)
  if (known === undefined) return [...FILE_TOOLS]
  return FILE_TOOLS.filter(name => known.has(name))
}

async function runOne(
  ctx: Context,
  providerName: string,
  parent: Agent,
  teamId: string,
  memberName: string,
  index: number,
  file: FileBatchItem,
  allow: readonly string[],
  signal: AbortSignal,
): Promise<FileBatchResult> {
  const boundary = ctx.subagents as unknown as OneShotBoundary
  if (typeof boundary.start !== 'function') {
    throw new Error('agent-teams: this Harness version does not expose the one-shot subagent start API required for temporary file workers')
  }
  const run = await boundary.start.call(ctx.subagents, providerName, {
    label: `${EPHEMERAL_FILE_BATCH_LABEL}${teamId}:${memberName}:${index}`,
    parent,
    signal,
    maxDepth: 0,
    toolFilter: { allow: [...allow] },
    persona: fileWorkerPersona(),
    prompt: [{ type: 'text', text: fileWorkerPrompt(file) }],
  })
  try {
    const result = await run.result
    return {
      path: file.path,
      operation: file.operation,
      stop_reason: result.stopReason,
      output: textOf(result.output),
    }
  } finally {
    await run.dispose()
  }
}

function fileWorkerPersona(): string {
  return [
    'You are a temporary file worker for one file. You are not a team member and you cannot be resumed.',
    'Use only read, write, and edit. Do not create a subagent, send a message, or touch team state.',
    'Finish with a short text result, then stop.',
  ].join('\n')
}

function fileWorkerPrompt(file: FileBatchItem): string {
  const lines = [
    `Operation: ${file.operation}`,
    `Path: ${file.path}`,
    `Instruction: ${file.instruction}`,
  ]
  if (file.operation === 'read') lines.push('Read the file and return the requested text.')
  if (file.operation === 'summarize') lines.push('Read the file and return a concise text summary. Do not modify the file.')
  if (file.operation === 'write') lines.push(`Replace the file with this exact content:\n${file.content ?? ''}`)
  return lines.join('\n')
}

function textOf(output: readonly ContentBlock[]): string {
  return output
    .map(block => block.type === 'text' ? block.text : '')
    .filter(text => text !== '')
    .join('\n')
}
