import {
    db,
    type FeedbackStatus,
    type Lead,
    type LeadActivity,
    type LeadActivityType,
    type LeadAudience,
    type LeadQuality,
    type LeadStage,
    type LearnerPersona,
    type Priority,
    type Tag,
} from '../db';
import { apiRequest, mapDbLeadToModel, stageToStatus } from './api';
import { requireUser, type SessionUser } from './auth';
import {
    LEAD_QUALITY_LABEL,
    LEARNER_PERSONA_LABEL,
    normalizeSource,
    sourceLabel,
    stageAudience,
    stagesForAudience,
} from './algo';
import { AppError } from './errors';
import {
    assertLeadEdit,
    assertWorkspaceAccess,
    requireAdmin,
} from './permissions';
import { logActivity } from './activity';
import { getTagsForEntities, setTagsForEntity } from './tags';
import {
    email as validateEmail,
    numberValue,
    oneOf,
    optional,
    PRIORITIES,
    required,
    website as validateWebsite,
} from './validation';
import { downloadCsv, toCsv } from '../utils/csv';

const LEAD_QUALITIES: LeadQuality[] = ['genuine', 'exploring', 'generic', 'not_fit'];
const LEARNER_PERSONAS: LearnerPersona[] = ['final_year', 'recent_grad', 'early_career', 'career_switcher', 'institution', 'other'];
const FEEDBACK_STATUSES: FeedbackStatus[] = ['not_requested', 'requested', 'submitted'];

export interface LeadWithMeta extends Lead {
    stage?: LeadStage;
    ownerName: string;
    ownerColor: string;
    tags: Tag[];
}

export interface LeadInput {
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    website?: string;
    jobTitle?: string;
    source?: string;
    sourceDetail?: string;
    industry?: string;
    location?: string;
    ownerId?: string;
    stageId?: string;
    priority?: Priority;
    value?: number;
    description?: string;
    tags?: string[];
    nextFollowUpAt?: number | null;
    audience?: LeadAudience;
    persona?: LearnerPersona;
    quality?: LeadQuality;
    firstChallengeAt?: number | null;
    challengeAttempts?: number | null;
    tracksExplored?: string[];
    lastActiveAt?: number | null;
    feedbackStatus?: FeedbackStatus;
    dropOffReason?: string;
    institutionType?: string;
    studentCount?: number | null;
}

export async function listLeadStages(workspaceId: string, audience?: LeadAudience): Promise<LeadStage[]> {
    const user = await requireUser();
    await assertWorkspaceAccess(user, workspaceId);
    const stages = await db.leadStages.where('workspaceId').equals(workspaceId).toArray();
    return (audience ? stagesForAudience(stages, audience) : stages.sort((a, b) => a.order - b.order));
}

export async function listLeads(workspaceId: string, includeArchived = false, audience?: LeadAudience): Promise<LeadWithMeta[]> {
    const user = await requireUser();
    await assertWorkspaceAccess(user, workspaceId);

    let leads: Lead[];
    try {
        const rows = await apiRequest<any[]>(`/leads?include_archived=${includeArchived ? 'true' : 'false'}`);
        leads = rows.map(r => mapDbLeadToModel(r, workspaceId));
        await db.leads.bulkPut(leads);
    } catch {
        leads = await db.leads.where('workspaceId').equals(workspaceId).toArray();
    }

    const filtered = (includeArchived ? leads : leads.filter(l => !l.archived))
        .filter(lead => !audience || (lead.audience || 'learner') === audience);
    const stages = await db.leadStages.where('workspaceId').equals(workspaceId).toArray();
    const stageMap = new Map(stages.map(s => [s.id, s]));
    const users = await db.users.bulkGet(Array.from(new Set(filtered.map(l => l.ownerId))));
    const userMap = new Map(users.filter(Boolean).map(u => [u!.id, u!]));
    const tags = await getTagsForEntities('lead', filtered.map(l => l.id));

    return filtered
        .map(lead => {
            const owner = userMap.get(lead.ownerId);
            return {
                ...lead,
                stage: stageMap.get(lead.stageId),
                ownerName: owner?.name || 'Unassigned',
                ownerColor: owner?.avatarColor || '#8e8e93',
                tags: tags[lead.id] || [],
            };
        })
        .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getLead(leadId: string): Promise<Lead> {
    await requireUser();
    try {
        const row = await apiRequest<any>(`/leads/${leadId}`);
        const lead = mapDbLeadToModel(row);
        await db.leads.put(lead);
        return lead;
    } catch {
        const lead = await db.leads.get(leadId);
        if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
        return lead;
    }
}

function optionalEnum<T extends string>(value: string | undefined, allowed: readonly T[], label: string): T | undefined {
    if (value === undefined || value === '') return undefined;
    if (!allowed.includes(value as T)) throw new AppError('VALIDATION', `Invalid ${label}.`);
    return value as T;
}

function cleanTracks(value: string[] | undefined): string[] | undefined {
    if (value === undefined) return undefined;
    return Array.from(new Set(value.map(item => item.trim()).filter(Boolean)))
        .slice(0, 30)
        .map(item => item.slice(0, 80));
}

function optionalTimestamp(value: number | null | undefined, label: string): number | undefined {
    if (value === undefined) return undefined;
    if (value === null) return undefined;
    if (!Number.isFinite(value) || value < 0) throw new AppError('VALIDATION', `${label} is invalid.`);
    return value;
}

async function normalizeLead(
    actor: SessionUser,
    workspaceId: string,
    input: Partial<LeadInput>,
    existing?: Lead,
): Promise<Omit<Lead, 'id' | 'createdAt' | 'createdBy'>> {
    const name = required(input.name ?? existing?.name, 'Lead name', 120);
    const allStages = await db.leadStages.where('workspaceId').equals(workspaceId).toArray();
    if (allStages.length === 0) throw new AppError('VALIDATION', 'No pipeline stages are configured for this workspace.');

    const audience: LeadAudience = input.audience ?? existing?.audience ?? 'learner';
    const stages = stagesForAudience(allStages, audience);
    if (stages.length === 0) throw new AppError('VALIDATION', `No ${audience} pipeline stages are configured.`);

    const requestedStageId = input.stageId ?? existing?.stageId;
    const stage = requestedStageId ? stages.find(s => s.id === requestedStageId) : stages[0];
    if (!stage) throw new AppError('VALIDATION', 'The selected pipeline stage does not belong to this pipeline.');

    const ownerId = input.ownerId ?? existing?.ownerId ?? actor.id;
    const membership = await db.workspaceMembers.where('[workspaceId+userId]').equals([workspaceId, ownerId]).first();
    if (!membership && actor.role !== 'admin') throw new AppError('VALIDATION', 'The selected lead owner is not in this workspace.');
    if (!membership) {
        const owner = await db.users.get(ownerId);
        if (!owner) throw new AppError('VALIDATION', 'The selected lead owner does not exist.');
    }

    const nextFollowUpAt = input.nextFollowUpAt === undefined
        ? existing?.nextFollowUpAt
        : input.nextFollowUpAt === null
            ? undefined
            : input.nextFollowUpAt;

    const firstChallengeAt = input.firstChallengeAt === undefined
        ? existing?.firstChallengeAt
        : optionalTimestamp(input.firstChallengeAt, 'First challenge date');
    const lastActiveAt = input.lastActiveAt === undefined
        ? existing?.lastActiveAt
        : optionalTimestamp(input.lastActiveAt, 'Last active date');
    const challengeAttempts = input.challengeAttempts === undefined
        ? (existing?.challengeAttempts ?? 0)
        : Math.floor(numberValue(input.challengeAttempts ?? 0, 'Challenge attempts', 0, 1_000_000));
    const feedbackStatus = input.feedbackStatus === undefined
        ? (existing?.feedbackStatus ?? 'not_requested')
        : oneOf(input.feedbackStatus, FEEDBACK_STATUSES, 'Feedback status');
    const studentCount = input.studentCount === undefined
        ? existing?.studentCount
        : input.studentCount === null
            ? undefined
            : Math.floor(numberValue(input.studentCount, 'Student count', 0, 1_000_000));

    return {
        workspaceId,
        name,
        company: optional(input.company ?? existing?.company, 'Company name', 160),
        email: validateEmail(input.email ?? existing?.email, 'Email'),
        phone: optional(input.phone ?? existing?.phone, 'Phone number', 60),
        website: validateWebsite(input.website ?? existing?.website),
        jobTitle: optional(input.jobTitle ?? existing?.jobTitle, 'Job title', 120),
        source: normalizeSource(input.source ?? existing?.source),
        sourceDetail: optional(input.sourceDetail ?? existing?.sourceDetail, 'Source detail', 300),
        industry: optional(input.industry ?? existing?.industry, 'Industry', 120),
        location: optional(input.location ?? existing?.location, 'Location', 160),
        ownerId,
        stageId: stage.id,
        priority: oneOf(input.priority ?? existing?.priority ?? 'medium', PRIORITIES, 'Priority'),
        value: numberValue(input.value ?? existing?.value ?? 0, 'Potential deal value', 0, 1_000_000_000),
        description: optional(input.description ?? existing?.description, 'Description', 4000),
        updatedAt: Date.now(),
        lastContactedAt: existing?.lastContactedAt,
        nextFollowUpAt,
        archived: existing?.archived ?? 0,
        convertedAt: stage.isWon ? (existing?.convertedAt ?? Date.now()) : existing?.convertedAt,
        audience,
        persona: optionalEnum(input.persona ?? existing?.persona, LEARNER_PERSONAS, 'persona'),
        quality: optionalEnum(input.quality ?? existing?.quality, LEAD_QUALITIES, 'lead quality'),
        firstChallengeAt,
        challengeAttempts,
        tracksExplored: input.tracksExplored === undefined ? existing?.tracksExplored : cleanTracks(input.tracksExplored),
        lastActiveAt,
        feedbackStatus,
        dropOffReason: optional(input.dropOffReason ?? existing?.dropOffReason, 'Drop-off reason', 2000),
        institutionType: optional(input.institutionType ?? existing?.institutionType, 'Institution type', 120),
        studentCount,
    };
}

export async function createLead(workspaceId: string, input: LeadInput): Promise<Lead> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const normalized = await normalizeLead(actor, workspaceId, input);

    const leadId = crypto.randomUUID();
    let lead: Lead = {
        ...normalized,
        id: leadId,
        createdAt: Date.now(),
        createdBy: actor.id,
    };

    try {
        const createdRow = await apiRequest<any>('/leads', {
            method: 'POST',
            body: JSON.stringify({
                id: lead.id,
                name: lead.name,
                contact: lead.email || lead.phone || lead.company || '',
                company: lead.company,
                email: lead.email,
                phone: lead.phone,
                source: lead.source,
                status: stageToStatus(lead.stageId),
                priority: lead.priority,
                value: lead.value,
                description: lead.description,
                audience: lead.audience,
                persona: lead.persona,
                quality: lead.quality,
                challenge_attempts: lead.challengeAttempts,
                tracks_explored: lead.tracksExplored,
                feedback_status: lead.feedbackStatus,
                drop_off_reason: lead.dropOffReason,
                institution_type: lead.institutionType,
                student_count: lead.studentCount,
                owner_id: actor.id,
            }),
        });
        lead = mapDbLeadToModel(createdRow, workspaceId);
    } catch (err: any) {
        if (err.code === 'AUTH') throw err;
        console.warn('Backend create lead fallback to local:', err.message);
    }

    await db.leads.add(lead);
    if (input.tags?.length) await setTagsForEntity(workspaceId, 'lead', lead.id, input.tags);
    await logActivity({
        workspaceId,
        userId: actor.id,
        entityType: 'lead',
        entityId: lead.id,
        action: 'created',
        title: `Created lead ${lead.name}`,
    });
    return lead;
}

export async function updateLead(leadId: string, input: Partial<LeadInput>): Promise<Lead> {
    const actor = await requireUser();
    const existing = await db.leads.get(leadId);
    if (!existing) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, existing.workspaceId);
    await assertLeadEdit(actor, existing);

    const normalized = await normalizeLead(actor, existing.workspaceId, input, existing);
    let updated: Lead = { ...existing, ...normalized, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy };

    try {
        const updatedRow = await apiRequest<any>(`/leads/${leadId}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: updated.name,
                contact: updated.email || updated.phone || updated.company || '',
                company: updated.company,
                email: updated.email,
                phone: updated.phone,
                source: updated.source,
                status: stageToStatus(updated.stageId),
                priority: updated.priority,
                value: updated.value,
                description: updated.description,
                audience: updated.audience,
                persona: updated.persona,
                quality: updated.quality,
                challenge_attempts: updated.challengeAttempts,
                tracks_explored: updated.tracksExplored,
                feedback_status: updated.feedbackStatus,
                drop_off_reason: updated.dropOffReason,
                institution_type: updated.institutionType,
                student_count: updated.studentCount,
                archived: updated.archived === 1,
            }),
        });
        updated = mapDbLeadToModel(updatedRow, existing.workspaceId);
    } catch (err: any) {
        if (err.code === 'AUTH') throw err;
        console.warn('Backend update lead fallback to local:', err.message);
    }

    await db.leads.put(updated);

    if (input.tags !== undefined) {
        await setTagsForEntity(existing.workspaceId, 'lead', leadId, input.tags);
    }

    if (existing.stageId !== updated.stageId) {
        const stage = await db.leadStages.get(updated.stageId);
        await logActivity({
            workspaceId: existing.workspaceId,
            userId: actor.id,
            entityType: 'lead',
            entityId: leadId,
            action: 'stage_changed',
            title: `Moved ${updated.name} to ${stage?.name || 'a new stage'}`,
        });
        await db.leadActivities.add({
            id: crypto.randomUUID(),
            workspaceId: existing.workspaceId,
            leadId,
            type: 'stage_change',
            subject: `Stage changed to ${stage?.name || 'Unknown'}`,
            body: '',
            occurredAt: Date.now(),
            createdAt: Date.now(),
            userId: actor.id,
        });
    } else {
        await logActivity({
            workspaceId: existing.workspaceId,
            userId: actor.id,
            entityType: 'lead',
            entityId: leadId,
            action: 'updated',
            title: `Updated lead ${updated.name}`,
        });
    }

    return updated;
}

export async function moveLeadStage(leadId: string, stageId: string): Promise<void> {
    const actor = await requireUser();
    const lead = await db.leads.get(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, lead.workspaceId);
    await assertLeadEdit(actor, lead);

    const stage = await db.leadStages.get(stageId);
    if (!stage || stage.workspaceId !== lead.workspaceId) {
        throw new AppError('VALIDATION', 'That pipeline stage is not part of this workspace.');
    }
    if (stageAudience(stage) !== (lead.audience || 'learner')) {
        throw new AppError('VALIDATION', 'Move this record inside its own pipeline.');
    }

    try {
        await apiRequest(`/leads/${leadId}`, {
            method: 'PUT',
            body: JSON.stringify({ status: stageToStatus(stageId), archived: false }),
        });
    } catch (err: any) {
        if (err.code === 'AUTH') throw err;
        console.warn('Backend move lead stage fallback to local:', err.message);
    }

    await db.leads.update(leadId, {
        stageId,
        updatedAt: Date.now(),
        convertedAt: stage.isWon ? Date.now() : lead.convertedAt,
        archived: 0,
    });
    await db.leadActivities.add({
        id: crypto.randomUUID(),
        workspaceId: lead.workspaceId,
        leadId,
        type: 'stage_change',
        subject: `Stage changed to ${stage.name}`,
        body: '',
        occurredAt: Date.now(),
        createdAt: Date.now(),
        userId: actor.id,
    });
    await logActivity({
        workspaceId: lead.workspaceId,
        userId: actor.id,
        entityType: 'lead',
        entityId: leadId,
        action: 'stage_changed',
        title: `Moved ${lead.name} to ${stage.name}`,
    });
}

export async function setLeadNextFollowUp(leadId: string, nextFollowUpAt: number | null): Promise<void> {
    const actor = await requireUser();
    const lead = await db.leads.get(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, lead.workspaceId);
    await assertLeadEdit(actor, lead);
    await db.leads.update(leadId, { nextFollowUpAt: nextFollowUpAt ?? undefined, updatedAt: Date.now() });
    await logActivity({
        workspaceId: lead.workspaceId,
        userId: actor.id,
        entityType: 'lead',
        entityId: leadId,
        action: 'follow_up',
        title: nextFollowUpAt ? `Scheduled follow-up for ${lead.name}` : `Cleared follow-up for ${lead.name}`,
    });
}

export async function addLeadActivity(leadId: string, input: {
    type: LeadActivityType;
    subject: string;
    body?: string;
    occurredAt?: number;
}): Promise<LeadActivity> {
    const actor = await requireUser();
    const lead = await db.leads.get(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, lead.workspaceId);

    const type = oneOf(input.type, ['call', 'email', 'meeting', 'message', 'follow_up', 'note', 'update', 'stage_change', 'challenge', 'feedback', 'activation'] as const, 'Activity type');
    const subject = required(input.subject, 'Activity subject', 200);
    const body = optional(input.body, 'Activity notes', 4000) || '';
    const occurredAt = input.occurredAt || Date.now();
    const now = Date.now();

    if (type === 'note') {
        try {
            await apiRequest(`/leads/${leadId}/notes`, {
                method: 'POST',
                body: JSON.stringify({ body: body ? `${subject}\n${body}` : subject }),
            });
        } catch (e: any) {
            console.warn('Backend add note fallback:', e.message);
        }
    }

    const activity: LeadActivity = {
        id: crypto.randomUUID(),
        workspaceId: lead.workspaceId,
        leadId,
        type,
        subject,
        body,
        occurredAt,
        createdAt: now,
        userId: actor.id,
    };

    await db.leadActivities.add(activity);
    await db.leads.update(leadId, {
        lastContactedAt: ['call', 'email', 'meeting', 'message', 'follow_up'].includes(type) ? occurredAt : lead.lastContactedAt,
        updatedAt: now,
    });
    await logActivity({
        workspaceId: lead.workspaceId,
        userId: actor.id,
        entityType: 'lead',
        entityId: leadId,
        action: `activity_${type}`,
        title: `${subject} — ${lead.name}`,
    });
    return activity;
}

export interface ChallengeAttemptResult {
    lead: Lead;
    movedToStage?: LeadStage;
}

export async function logChallengeAttempt(
    leadId: string,
    input: { count?: number; track?: string } = {},
): Promise<ChallengeAttemptResult> {
    const actor = await requireUser();
    const lead = await db.leads.get(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, lead.workspaceId);
    await assertLeadEdit(actor, lead);

    const count = Math.floor(numberValue(input.count ?? 1, 'Challenge attempts', 1, 50));
    const now = Date.now();
    const stages = await listLeadStages(lead.workspaceId, lead.audience || 'learner');
    const current = stages.find(stage => stage.id === lead.stageId);
    const stageByName = (name: string) => stages.find(stage => stage.name.trim().toLowerCase() === name);
    const activated = stageByName('activated');
    const engaged = stageByName('engaged');
    const lost = stages.find(stage => stage.isLost === 1);
    const feedback = stages.find(stage => stage.isWon === 1);
    const currentOrder = current?.order ?? -1;
    const attempts = (lead.challengeAttempts || 0) + count;
    const tracks = cleanTracks([...(lead.tracksExplored || []), ...(input.track ? [input.track] : [])]) || [];

    let nextStage = current;
    if (current?.id !== lost?.id && current?.id !== feedback?.id) {
        if (engaged && attempts >= 3 && currentOrder < engaged.order) nextStage = engaged;
        else if (activated && currentOrder < activated.order) nextStage = activated;
    }

    const updated: Lead = {
        ...lead,
        challengeAttempts: attempts,
        firstChallengeAt: lead.firstChallengeAt ?? now,
        lastActiveAt: now,
        tracksExplored: tracks,
        stageId: nextStage?.id || lead.stageId,
        feedbackStatus: lead.feedbackStatus || 'not_requested',
        updatedAt: now,
    };
    await db.leads.put(updated);
    await db.leadActivities.add({
        id: crypto.randomUUID(),
        workspaceId: lead.workspaceId,
        leadId,
        type: 'challenge',
        subject: `Challenge attempt${count === 1 ? '' : 's'} logged (${count})`,
        body: input.track ? `Track: ${input.track}` : '',
        occurredAt: now,
        createdAt: now,
        userId: actor.id,
    });
    await logActivity({
        workspaceId: lead.workspaceId,
        userId: actor.id,
        entityType: 'lead',
        entityId: leadId,
        action: 'challenge_logged',
        title: `${lead.name} attempted ${count} challenge${count === 1 ? '' : 's'}`,
    });

    return {
        lead: updated,
        movedToStage: nextStage && nextStage.id !== lead.stageId ? nextStage : undefined,
    };
}

export async function requestLearnerFeedback(leadId: string): Promise<void> {
    const actor = await requireUser();
    const lead = await db.leads.get(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, lead.workspaceId);
    await assertLeadEdit(actor, lead);
    if ((lead.audience || 'learner') !== 'learner') {
        throw new AppError('VALIDATION', 'Feedback requests are only available for learners.');
    }

    const now = Date.now();
    await db.leads.update(leadId, { feedbackStatus: 'requested', updatedAt: now });
    await db.leadActivities.add({
        id: crypto.randomUUID(),
        workspaceId: lead.workspaceId,
        leadId,
        type: 'feedback',
        subject: 'Structured feedback requested',
        body: '',
        occurredAt: now,
        createdAt: now,
        userId: actor.id,
    });
    await logActivity({
        workspaceId: lead.workspaceId,
        userId: actor.id,
        entityType: 'lead',
        entityId: leadId,
        action: 'feedback_requested',
        title: `Requested feedback from ${lead.name}`,
    });
}

export async function listLeadActivities(leadId: string): Promise<LeadActivity[]> {
    const actor = await requireUser();
    const lead = await db.leads.get(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, lead.workspaceId);

    try {
        const notes = await apiRequest<any[]>(`/leads/${leadId}/notes`);
        if (notes && notes.length > 0) {
            for (const n of notes) {
                const noteActivity: LeadActivity = {
                    id: n.id,
                    workspaceId: lead.workspaceId,
                    leadId: n.lead_id,
                    type: 'note',
                    subject: 'Note',
                    body: n.body,
                    occurredAt: new Date(n.created_at).getTime(),
                    createdAt: new Date(n.created_at).getTime(),
                    userId: n.author_id,
                };
                await db.leadActivities.put(noteActivity);
            }
        }
    } catch {
        // Fallback to local Dexie activities
    }

    return db.leadActivities.where('leadId').equals(leadId).reverse().sortBy('occurredAt');
}

export async function archiveLead(leadId: string, archived: boolean): Promise<void> {
    const actor = await requireUser();
    const lead = await db.leads.get(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, lead.workspaceId);
    await assertLeadEdit(actor, lead);

    try {
        await apiRequest(`/leads/${leadId}`, {
            method: 'PUT',
            body: JSON.stringify({ archived }),
        });
    } catch (e: any) {
        if (e.code === 'AUTH') throw e;
        console.warn('Backend archive lead fallback:', e.message);
    }

    await db.leads.update(leadId, { archived: archived ? 1 : 0, updatedAt: Date.now() });
    await logActivity({
        workspaceId: lead.workspaceId,
        userId: actor.id,
        entityType: 'lead',
        entityId: leadId,
        action: archived ? 'archived' : 'restored',
        title: `${archived ? 'Archived' : 'Restored'} lead ${lead.name}`,
    });
}

export async function deleteLead(leadId: string): Promise<void> {
    const actor = await requireUser();
    const lead = await db.leads.get(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, lead.workspaceId);
    if (actor.role !== 'admin') throw new AppError('FORBIDDEN', 'Only admins can delete leads.');

    try {
        await apiRequest(`/leads/${leadId}`, { method: 'DELETE' });
    } catch (e: any) {
        if (e.code === 'AUTH') throw e;
        console.warn('Backend delete lead fallback:', e.message);
    }

    await db.transaction('rw', [
        db.leads, db.leadActivities, db.projectLeads, db.tasks, db.calendarEvents,
        db.recordTags, db.noteLinks, db.activities, db.followUps, db.learnerFeedback,
    ], async () => {
        await db.leads.delete(leadId);
        await db.leadActivities.where('leadId').equals(leadId).delete();
        await db.projectLeads.where('leadId').equals(leadId).delete();
        await db.tasks.where('leadId').equals(leadId).modify({ leadId: undefined });
        await db.calendarEvents.where('leadId').equals(leadId).modify({ leadId: undefined });
        await db.followUps.where('[entityType+entityId]').equals(['lead', leadId]).delete();
        await db.learnerFeedback.where('leadId').equals(leadId).delete();
        await db.recordTags.where('[entityType+entityId]').equals(['lead', leadId]).delete();
        await db.noteLinks.where('[entityType+entityId]').equals(['lead', leadId]).delete();
        await db.activities.where('[entityType+entityId]').equals(['lead', leadId]).delete();
    });
}

export async function bulkArchiveLeads(leadIds: string[], archived: boolean): Promise<void> {
    for (const id of leadIds) await archiveLead(id, archived);
}

export async function bulkDeleteLeads(leadIds: string[]): Promise<void> {
    await requireAdmin();
    for (const id of leadIds) await deleteLead(id);
}

export async function bulkMoveLeads(leadIds: string[], stageId: string): Promise<void> {
    for (const id of leadIds) await moveLeadStage(id, stageId);
}

export async function bulkSetLeadPriority(leadIds: string[], priority: Priority): Promise<void> {
    const actor = await requireUser();
    oneOf(priority, PRIORITIES, 'Priority');
    for (const id of leadIds) {
        const lead = await db.leads.get(id);
        if (!lead) continue;
        await assertWorkspaceAccess(actor, lead.workspaceId);
        await assertLeadEdit(actor, lead);
        await db.leads.update(id, { priority, updatedAt: Date.now() });
    }
}

/* ------------------------------------------------------------------ */
/* CSV import / export                                                 */
/* ------------------------------------------------------------------ */

export interface LeadImportResult {
    imported: number;
    skippedDuplicates: number;
    invalid: { row: number; errors: string[] }[];
}

function duplicateKeys(lead: Pick<Lead, 'email' | 'phone' | 'name' | 'company'>): string[] {
    const keys: string[] = [];
    if (lead.email) keys.push(`email:${lead.email.toLowerCase()}`);
    const digits = (lead.phone || '').replace(/\D/g, '');
    if (digits.length >= 6) keys.push(`phone:${digits}`);
    if (lead.name) keys.push(`name:${lead.name.toLowerCase()}|${(lead.company || '').toLowerCase()}`);
    return keys;
}

export async function importLeads(
    workspaceId: string,
    records: Record<string, string>[],
): Promise<LeadImportResult> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const allStages = await db.leadStages.where('workspaceId').equals(workspaceId).toArray();
    const users = await db.users.toArray();
    const existingLeads = await db.leads.where('workspaceId').equals(workspaceId).toArray();
    const seen = new Set<string>();
    existingLeads.forEach(l => duplicateKeys(l).forEach(k => seen.add(k)));

    const result: LeadImportResult = { imported: 0, skippedDuplicates: 0, invalid: [] };

    for (let i = 0; i < records.length; i++) {
        const rowNumber = i + 2; // account for header row
        const row = records[i];
        const errors: string[] = [];
        let name = (row.name || '').trim();
        if (!name) errors.push('Lead name is required');
        if (name.length > 120) errors.push('Lead name is too long');

        let email: string | undefined;
        if (row.email?.trim()) {
            try { email = validateEmail(row.email, 'Email'); } catch (e) { errors.push((e as Error).message); }
        }
        let website: string | undefined;
        if (row.website?.trim()) {
            try { website = validateWebsite(row.website); } catch (e) { errors.push((e as Error).message); }
        }
        const rawValue = (row.value || '').replace(/[^0-9.-]/g, '');
        const value = rawValue ? Number(rawValue) : 0;
        if (!Number.isFinite(value) || value < 0) errors.push('Deal value must be a positive number');

        const audience: LeadAudience = /institution|college|university/i.test(row.audience || '')
            ? 'institution'
            : 'learner';
        const stages = stagesForAudience(allStages, audience);
        const stageName = (row.stage || '').trim();
        const stage = stageName
            ? stages.find(s => s.name.toLowerCase() === stageName.toLowerCase() || s.id === stageName)
            : stages[0];
        if (!stage) errors.push('Pipeline stage not found');

        const ownerQuery = (row.owner || '').trim().toLowerCase();
        const owner = ownerQuery
            ? users.find(u => u.email.toLowerCase() === ownerQuery || u.name.toLowerCase() === ownerQuery)
            : actor;
        if (!owner) errors.push('Lead owner not found');

        const priorityText = (row.priority || 'medium').trim().toLowerCase();
        const priority = PRIORITIES.includes(priorityText as Priority) ? priorityText as Priority : 'medium';

        if (errors.length > 0 || !stage || !owner) {
            result.invalid.push({ row: rowNumber, errors });
            continue;
        }

        const qualityText = (row.quality || '').trim().toLowerCase().replace(/\s+/g, '_');
        const quality = LEAD_QUALITIES.includes(qualityText as LeadQuality)
            ? qualityText as LeadQuality
            : /genuine|fde/.test(qualityText) ? 'genuine'
                : /generic|dsa|placement/.test(qualityText) ? 'generic'
                    : /not.?fit/.test(qualityText) ? 'not_fit'
                        : /explor/.test(qualityText) ? 'exploring' : undefined;
        const personaText = (row.persona || '').trim().toLowerCase().replace(/\s+/g, '_');
        const persona = LEARNER_PERSONAS.includes(personaText as LearnerPersona)
            ? personaText as LearnerPersona
            : /final/.test(personaText) ? 'final_year'
                : /recent|graduate/.test(personaText) ? 'recent_grad'
                    : /early/.test(personaText) ? 'early_career'
                        : /switch/.test(personaText) ? 'career_switcher'
                            : /institution|college/.test(personaText) ? 'institution' : undefined;
        const attempts = Math.max(0, Math.floor(Number((row.attempts || row.challengeAttempts || '0').replace(/[^0-9.]/g, '')) || 0));
        const firstChallenge = (row.firstChallenge || '').trim();
        const firstChallengeAt = firstChallenge ? new Date(firstChallenge).getTime() : undefined;

        const candidate: Lead = {
            id: crypto.randomUUID(),
            workspaceId,
            name,
            company: (row.company || row.institution || '').trim() || undefined,
            email,
            phone: (row.phone || '').trim() || undefined,
            website,
            jobTitle: (row.jobTitle || row.title || row.role || '').trim() || undefined,
            source: normalizeSource((row.source || '').trim()) || undefined,
            sourceDetail: (row.sourceDetail || row.campaign || '').trim() || undefined,
            industry: (row.industry || '').trim() || undefined,
            location: (row.location || row.city || '').trim() || undefined,
            ownerId: owner.id,
            stageId: stage.id,
            priority,
            value: Math.round(value),
            description: (row.description || row.notes || '').trim() || undefined,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            archived: 0,
            createdBy: actor.id,
            audience,
            persona,
            quality,
            firstChallengeAt: Number.isFinite(firstChallengeAt) ? firstChallengeAt : undefined,
            challengeAttempts: attempts,
            tracksExplored: (row.tracks || '').split(/[;,]/).map(item => item.trim()).filter(Boolean),
            lastActiveAt: undefined,
            feedbackStatus: 'not_requested',
            dropOffReason: (row.dropOffReason || row.dropoff || '').trim() || undefined,
            institutionType: (row.institutionType || '').trim() || undefined,
            studentCount: Number((row.students || row.studentCount || '').replace(/[^0-9.]/g, '')) || undefined,
        };

        const keys = duplicateKeys(candidate);
        const duplicate = keys.some(k => seen.has(k));
        if (duplicate) {
            result.skippedDuplicates++;
            continue;
        }

        await db.leads.add(candidate);
        keys.forEach(k => seen.add(k));
        const tagNames = (row.tags || '').split(/[;,]/).map(t => t.trim()).filter(Boolean);
        if (tagNames.length) await setTagsForEntity(workspaceId, 'lead', candidate.id, tagNames);
        await logActivity({
            workspaceId,
            userId: actor.id,
            entityType: 'lead',
            entityId: candidate.id,
            action: 'imported',
            title: `Imported lead ${candidate.name}`,
        });
        result.imported++;
    }

    return result;
}

export async function exportLeadsCsv(workspaceId: string, leadIds: string[]): Promise<string> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const leads = await db.leads.bulkGet(leadIds);
    const stages = await db.leadStages.where('workspaceId').equals(workspaceId).toArray();
    const stageMap = new Map(stages.map(s => [s.id, s.name]));
    const users = await db.users.toArray();
    const userMap = new Map(users.map(u => [u.id, u]));
    const tags = await getTagsForEntities('lead', leadIds);

    const rows = leads.filter(Boolean).map(lead => {
        const l = lead!;
        return [
            l.name,
            l.audience || 'learner',
            l.company || '',
            l.email || '',
            l.phone || '',
            l.website || '',
            l.jobTitle || '',
            stageMap.get(l.stageId) || '',
            l.priority,
            l.value,
            sourceLabel(l.source),
            l.sourceDetail || '',
            l.persona ? LEARNER_PERSONA_LABEL[l.persona] : '',
            l.quality ? LEAD_QUALITY_LABEL[l.quality] : '',
            l.industry || '',
            l.location || '',
            l.institutionType || '',
            l.studentCount ?? '',
            l.challengeAttempts || 0,
            l.tracksExplored?.join('; ') || '',
            l.firstChallengeAt ? new Date(l.firstChallengeAt).toISOString() : '',
            l.lastActiveAt ? new Date(l.lastActiveAt).toISOString() : '',
            l.feedbackStatus || 'not_requested',
            l.dropOffReason || '',
            userMap.get(l.ownerId)?.name || '',
            userMap.get(l.ownerId)?.email || '',
            l.description || '',
            (tags[l.id] || []).map(t => t.name).join('; '),
            l.lastContactedAt ? new Date(l.lastContactedAt).toISOString() : '',
            l.nextFollowUpAt ? new Date(l.nextFollowUpAt).toISOString() : '',
            new Date(l.createdAt).toISOString(),
        ];
    });

    return toCsv([
        'Lead Name', 'Audience', 'Company', 'Email', 'Phone', 'Website', 'Job Title', 'Stage', 'Priority',
        'Deal Value', 'Source', 'Source Detail', 'Persona', 'Quality', 'Industry', 'Location',
        'Institution Type', 'Student Count', 'Challenge Attempts', 'Tracks', 'First Challenge',
        'Last Active', 'Feedback Status', 'Drop-off Reason', 'Owner Name', 'Owner Email', 'Description',
        'Tags', 'Last Contacted', 'Next Follow-up', 'Created At',
    ], rows);
}

export function downloadLeadsCsv(csv: string): void {
    downloadCsv(`ninai_leads_${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
