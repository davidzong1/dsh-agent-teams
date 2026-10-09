import type { ModelDirectory } from '@deepseek-ai/dsh-client-ui-model-selection/client';
import type { ActivityMember, ActivityTeam } from './activity-monitor.ts';
import type { AgentTeamsTranslate } from './locales.ts';
/** Edits the durable quota-only route without changing the captain's model. */
export declare function MemberEmergencyEditor({ team, member, directory, t }: {
    readonly team: ActivityTeam;
    readonly member: ActivityMember;
    readonly directory: ModelDirectory;
    readonly t: AgentTeamsTranslate;
}): import("react").JSX.Element;
