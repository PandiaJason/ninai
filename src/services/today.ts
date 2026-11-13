import { db, type EntityType, type Lead, type LeadStage } from '../db';
import { requireUser } from './auth';
import { assertWorkspaceAccess } from './permissions';
import { listLeadStages } from './leads';
import { listFollowUps, type FollowUpWithMeta } from './followUps';

export type TodayKind = 'followup' | 'feedback_requested' | 'activation' | 'stalled';

export type TodayAction =
    | { type: 'open_lead'; leadId: string }
    | { type: 'open_project'; projectId: string }
    | { type: 'open_task'; taskId: string }
    | { type: 'open_note'; noteId: string }
    | { type: 'record_feedback'; leadId: string; leadName: string }
    | { type: 'request_feedback'; leadId: string; leadName: string };

export interface TodayItem {
    id: string;
    kind: TodayKind;
    title: string;
    subtitle: string;
    meta: string;
    actionLabel: string;
    action: TodayAction;
}

export interface TodayData {
    items: TodayItem[];
    counts: {
        followUps: number;
        feedbackRequested: number;
        activation: number;
        stalled: number;
    };
    followUps: TodayItem[];
    feedbackRequested: TodayItem[];
    activation: TodayItem[];
    stalled: TodayItem[];
}

const DAY = 86_400_000;

function endOfToday(): number {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    return date.getTime();
}

function lastTouch(lead: Lead): number {
    return Math.max(lead.lastActiveAt || 0, lead.lastContactedAt || 0, lead.updatedAt || 0);
}

function openFollowUpAction(followUp: FollowUpWithMeta): TodayAction {
    const entityType = followUp.entityType as EntityType;
    if (entityType === 'lead') return { type: 'open_lead', leadId: followUp.entityId };
    if (entityType === 'project') return { type: 'open_project', projectId: followUp.entityId };
    if (entityType === 'task') return { type: 'open_task', taskId: followUp.entityId };
    return { type: 'open_note', noteId: followUp.entityId };
}

export async function getTodayData(workspaceId: string, userId: string): Promise<TodayData> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);

    const [allLeads, stages, allFeedback, dueFollowUps] = await Promise.all([
        db.leads.where('workspaceId').equals(workspaceId).toArray(),
        listLeadStages(workspaceId),
        db.learnerFeedback.where('workspaceId').equals(workspaceId).toArray(),
        listFollowUps(workspaceId, {
            status: 'pending',
            assignedTo: userId,
            to: endOfToday(),
            limit: 100,
        }),
    ]);

    const stageMap = new Map<string, LeadStage>(stages.map(stage => [stage.id, stage]));
    const feedbackLeadIds = new Set(allFeedback.map(feedback => feedback.leadId));
    const learnerLeads = allLeads.filter(lead => !lead.archived && (lead.audience || 'learner') === 'learner');
    const openLearners = learnerLeads.filter(lead => {
        const stage = stageMap.get(lead.stageId);
        return !stage?.isWon && !stage?.isLost;
    });
    const staleBefore = Date.now() - 14 * DAY;

    const followUps: TodayItem[] = dueFollowUps.map(followUp => ({
        id: `followup-${followUp.id}`,
        kind: 'followup',
        title: followUp.title,
        subtitle: `${followUp.entityTitle}${followUp.channel ? ` · ${followUp.channel}` : ''}`,
        meta: followUp.overdue ? 'Overdue' : 'Due today',
        actionLabel: 'Open',
        action: openFollowUpAction(followUp),
    }));

    const feedbackRequested: TodayItem[] = openLearners
        .filter(lead => lead.feedbackStatus === 'requested' && !feedbackLeadIds.has(lead.id))
        .sort((a, b) => lastTouch(a) - lastTouch(b))
        .map(lead => ({
            id: `requested-${lead.id}`,
            kind: 'feedback_requested',
            title: lead.name,
            subtitle: `${lead.challengeAttempts || 0} challenge attempt${(lead.challengeAttempts || 0) === 1 ? '' : 's'} · request is waiting`,
            meta: 'Record their answers',
            actionLabel: 'Record feedback',
            action: { type: 'record_feedback', leadId: lead.id, leadName: lead.name },
        }));

    const activation: TodayItem[] = openLearners
        .filter(lead => {
            if (feedbackLeadIds.has(lead.id) || lead.feedbackStatus === 'requested') return false;
            return !!lead.firstChallengeAt || (lead.challengeAttempts || 0) > 0;
        })
        .sort((a, b) => lastTouch(a) - lastTouch(b))
        .map(lead => ({
            id: `activation-${lead.id}`,
            kind: 'activation',
            title: lead.name,
            subtitle: `${lead.challengeAttempts || 0} attempt${(lead.challengeAttempts || 0) === 1 ? '' : 's'} · activated without feedback`,
            meta: 'Close the loop',
            actionLabel: 'Request feedback',
            action: { type: 'request_feedback', leadId: lead.id, leadName: lead.name },
        }));

    const learnerIdsInFeedbackQueues = new Set([
        ...feedbackRequested.map(item => item.id.replace(/^requested-/, '')),
        ...activation.map(item => item.id.replace(/^activation-/, '')),
    ]);

    const stalled: TodayItem[] = openLearners
        .filter(lead => {
            if (learnerIdsInFeedbackQueues.has(lead.id)) return false;
            const touch = lastTouch(lead);
            return !!touch && touch < staleBefore;
        })
        .sort((a, b) => lastTouch(a) - lastTouch(b))
        .map(lead => {
            const days = Math.max(14, Math.floor((Date.now() - lastTouch(lead)) / DAY));
            return {
                id: `stalled-${lead.id}`,
                kind: 'stalled',
                title: lead.name,
                subtitle: lead.company || 'Independent learner',
                meta: `Quiet for ${days} days`,
                actionLabel: 'Open learner',
                action: { type: 'open_lead', leadId: lead.id } as TodayAction,
            };
        });

    return {
        items: [...followUps, ...feedbackRequested, ...activation, ...stalled],
        counts: {
            followUps: followUps.length,
            feedbackRequested: feedbackRequested.length,
            activation: activation.length,
            stalled: stalled.length,
        },
        followUps,
        feedbackRequested,
        activation,
        stalled,
    };
}
