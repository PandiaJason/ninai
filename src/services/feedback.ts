import {
    db,
    type FeedbackTheme,
    type LearnerFeedback,
    type StuckCategory,
} from '../db';
import { requireUser } from './auth';
import { STUCK_CATEGORIES, FEEDBACK_THEMES, stagesForAudience } from './algo';
import { AppError } from './errors';
import { assertLeadEdit, assertWorkspaceAccess } from './permissions';
import { logActivity } from './activity';
import { numberValue, oneOf, optional, required } from './validation';

const STUCK_IDS = STUCK_CATEGORIES.map(category => category.id);
const THEME_IDS = FEEDBACK_THEMES.map(theme => theme.id);

export interface LearnerFeedbackInput {
    whyStarted: string;
    tracksExplored?: string[];
    stuckCategory: StuckCategory;
    whereStuck: string;
    continuedReason?: string;
    stoppedReason?: string;
    fdeHelpRating: number;
    recommendations?: string;
    themes?: FeedbackTheme[];
    consentToContact?: boolean;
}

function cleanList(values: string[] | undefined, max: number, label: string): string[] {
    const cleaned = Array.from(new Set((values || []).map(value => value.trim()).filter(Boolean)))
        .slice(0, max)
        .map(value => value.slice(0, 100));
    if (cleaned.some(value => value.length > 100)) {
        throw new AppError('VALIDATION', `${label} must be 100 characters or fewer.`);
    }
    return cleaned;
}

export async function getFeedbackForLead(leadId: string): Promise<LearnerFeedback | undefined> {
    const actor = await requireUser();
    const lead = await db.leads.get(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, lead.workspaceId);
    return db.learnerFeedback.where('leadId').equals(leadId).first();
}

export async function saveLearnerFeedback(
    leadId: string,
    input: LearnerFeedbackInput,
): Promise<LearnerFeedback> {
    const actor = await requireUser();
    const lead = await db.leads.get(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, lead.workspaceId);
    await assertLeadEdit(actor, lead);
    if ((lead.audience || 'learner') !== 'learner') {
        throw new AppError('VALIDATION', 'Structured feedback is only available for learner records.');
    }

    const whyStarted = required(input.whyStarted, 'Why they started', 3000);
    const whereStuck = required(input.whereStuck, 'Where they got stuck', 3000);
    const stuckCategory = oneOf(input.stuckCategory, STUCK_IDS, 'Stuck category');
    const fdeHelpRating = Math.floor(numberValue(input.fdeHelpRating, 'FDE help rating', 1, 5));
    const themes = (input.themes || []).filter((theme): theme is FeedbackTheme => THEME_IDS.includes(theme));
    const tracksExplored = cleanList(input.tracksExplored, 30, 'Track name');
    const now = Date.now();
    const existing = await db.learnerFeedback.where('leadId').equals(leadId).first();

    const feedback: LearnerFeedback = {
        id: existing?.id || crypto.randomUUID(),
        workspaceId: lead.workspaceId,
        leadId,
        whyStarted,
        tracksExplored,
        stuckCategory,
        whereStuck,
        continuedReason: optional(input.continuedReason, 'Why they continued', 3000),
        stoppedReason: optional(input.stoppedReason, 'Why they stopped', 3000),
        fdeHelpRating,
        recommendations: optional(input.recommendations, 'What should change', 3000),
        themes: themes.slice(0, 12),
        consentToContact: input.consentToContact ? 1 : 0,
        submittedAt: existing?.submittedAt || now,
        createdBy: existing?.createdBy || actor.id,
        updatedAt: now,
    };

    const stages = stagesForAudience(
        await db.leadStages.where('workspaceId').equals(lead.workspaceId).toArray(),
        'learner',
    );
    const feedbackStage = stages.find(stage => stage.isWon === 1);
    const lostStage = stages.find(stage => stage.isLost === 1);
    const shouldMove = feedbackStage && lead.stageId !== lostStage?.id;

    await db.transaction('rw', [db.learnerFeedback, db.leads, db.leadActivities], async () => {
        await db.learnerFeedback.put(feedback);
        await db.leads.update(leadId, {
            feedbackStatus: 'submitted',
            stageId: shouldMove ? feedbackStage!.id : lead.stageId,
            convertedAt: shouldMove && feedbackStage?.isWon ? (lead.convertedAt ?? now) : lead.convertedAt,
            updatedAt: now,
        });
        await db.leadActivities.add({
            id: crypto.randomUUID(),
            workspaceId: lead.workspaceId,
            leadId,
            type: 'feedback',
            subject: existing ? 'Structured feedback updated' : 'Structured feedback submitted',
            body: `FDE help rating: ${fdeHelpRating}/5`,
            occurredAt: now,
            createdAt: now,
            userId: actor.id,
        });
    });

    await logActivity({
        workspaceId: lead.workspaceId,
        userId: actor.id,
        entityType: 'lead',
        entityId: leadId,
        action: existing ? 'feedback_updated' : 'feedback_submitted',
        title: `${existing ? 'Updated' : 'Received'} feedback from ${lead.name}`,
    });

    return feedback;
}

export async function deleteLearnerFeedback(leadId: string): Promise<void> {
    const actor = await requireUser();
    const lead = await db.leads.get(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, lead.workspaceId);
    await assertLeadEdit(actor, lead);
    const feedback = await db.learnerFeedback.where('leadId').equals(leadId).first();
    if (!feedback) return;
    await db.transaction('rw', [db.learnerFeedback, db.leads], async () => {
        await db.learnerFeedback.delete(feedback.id);
        await db.leads.update(leadId, { feedbackStatus: 'not_requested', updatedAt: Date.now() });
    });
    await logActivity({
        workspaceId: lead.workspaceId,
        userId: actor.id,
        entityType: 'lead',
        entityId: leadId,
        action: 'feedback_deleted',
        title: `Deleted feedback for ${lead.name}`,
    });
}

export async function listLearnerFeedback(workspaceId: string): Promise<LearnerFeedback[]> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    return db.learnerFeedback.where('workspaceId').equals(workspaceId).reverse().sortBy('submittedAt');
}
