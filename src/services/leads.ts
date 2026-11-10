import {
    db,
    type Lead,
    type LeadActivity,
    type LeadActivityType,
    type LeadStage,
    type Priority,
    type Tag,
} from '../db';
import { requireUser, type SessionUser } from './auth';
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
    industry?: string;
    location?: string;
    ownerId?: string;
    stageId?: string;
    priority?: Priority;
    value?: number;
    description?: string;
    tags?: string[];
    nextFollowUpAt?: number | null;
}

export async function listLeadStages(workspaceId: string): Promise<LeadStage[]> {
    const user = await requireUser();
    await assertWorkspaceAccess(user, workspaceId);
    return db.leadStages.where('workspaceId').equals(workspaceId).sortBy('order');
}

export async function listLeads(workspaceId: string, includeArchived = false): Promise<LeadWithMeta[]> {
    const user = await requireUser();
    await assertWorkspaceAccess(user, workspaceId);

    const leads = await db.leads.where('workspaceId').equals(workspaceId).toArray();
    const filtered = includeArchived ? leads : leads.filter(l => !l.archived);
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
    const user = await requireUser();
    const lead = await db.leads.get(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(user, lead.workspaceId);
    return lead;
}

async function normalizeLead(
    actor: SessionUser,
    workspaceId: string,
    input: Partial<LeadInput>,
    existing?: Lead,
): Promise<Omit<Lead, 'id' | 'createdAt' | 'createdBy'>> {
    const name = required(input.name ?? existing?.name, 'Lead name', 120);
    const stages = await db.leadStages.where('workspaceId').equals(workspaceId).toArray();
    if (stages.length === 0) throw new AppError('VALIDATION', 'No pipeline stages are configured for this workspace.');

    const requestedStageId = input.stageId ?? existing?.stageId;
    const stage = requestedStageId ? stages.find(s => s.id === requestedStageId) : stages.sort((a, b) => a.order - b.order)[0];
    if (!stage) throw new AppError('VALIDATION', 'The selected pipeline stage does not exist.');

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

    return {
        workspaceId,
        name,
        company: optional(input.company ?? existing?.company, 'Company name', 160),
        email: validateEmail(input.email ?? existing?.email, 'Email'),
        phone: optional(input.phone ?? existing?.phone, 'Phone number', 60),
        website: validateWebsite(input.website ?? existing?.website),
        jobTitle: optional(input.jobTitle ?? existing?.jobTitle, 'Job title', 120),
        source: optional(input.source ?? existing?.source, 'Lead source', 120),
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
    };
}

export async function createLead(workspaceId: string, input: LeadInput): Promise<Lead> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const normalized = await normalizeLead(actor, workspaceId, input);

    const lead: Lead = {
        ...normalized,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        createdBy: actor.id,
    };

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
    const updated: Lead = { ...existing, ...normalized, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy };
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

    const type = oneOf(input.type, ['call', 'email', 'meeting', 'message', 'follow_up', 'note', 'update', 'stage_change'] as const, 'Activity type');
    const subject = required(input.subject, 'Activity subject', 200);
    const body = optional(input.body, 'Activity notes', 4000) || '';
    const occurredAt = input.occurredAt || Date.now();
    const now = Date.now();

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

export async function listLeadActivities(leadId: string): Promise<LeadActivity[]> {
    const actor = await requireUser();
    const lead = await db.leads.get(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, lead.workspaceId);
    return db.leadActivities.where('leadId').equals(leadId).reverse().sortBy('occurredAt');
}

export async function archiveLead(leadId: string, archived: boolean): Promise<void> {
    const actor = await requireUser();
    const lead = await db.leads.get(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, lead.workspaceId);
    await assertLeadEdit(actor, lead);

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

    await db.transaction('rw', [
        db.leads, db.leadActivities, db.projectLeads, db.tasks, db.calendarEvents,
        db.recordTags, db.noteLinks, db.activities,
    ], async () => {
        await db.leads.delete(leadId);
        await db.leadActivities.where('leadId').equals(leadId).delete();
        await db.projectLeads.where('leadId').equals(leadId).delete();
        await db.tasks.where('leadId').equals(leadId).modify({ leadId: undefined });
        await db.calendarEvents.where('leadId').equals(leadId).modify({ leadId: undefined });
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
    const stages = await db.leadStages.where('workspaceId').equals(workspaceId).toArray();
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

        const stageName = (row.stage || '').trim();
        const stage = stageName
            ? stages.find(s => s.name.toLowerCase() === stageName.toLowerCase() || s.id === stageName)
            : stages.sort((a, b) => a.order - b.order)[0];
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

        const candidate: Lead = {
            id: crypto.randomUUID(),
            workspaceId,
            name,
            company: (row.company || '').trim() || undefined,
            email,
            phone: (row.phone || '').trim() || undefined,
            website,
            jobTitle: (row.jobTitle || row.title || '').trim() || undefined,
            source: (row.source || '').trim() || undefined,
            industry: (row.industry || '').trim() || undefined,
            location: (row.location || '').trim() || undefined,
            ownerId: owner.id,
            stageId: stage.id,
            priority,
            value: Math.round(value),
            description: (row.description || row.notes || '').trim() || undefined,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            archived: 0,
            createdBy: actor.id,
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
            l.company || '',
            l.email || '',
            l.phone || '',
            l.website || '',
            l.jobTitle || '',
            stageMap.get(l.stageId) || '',
            l.priority,
            l.value,
            l.source || '',
            l.industry || '',
            l.location || '',
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
        'Lead Name', 'Company', 'Email', 'Phone', 'Website', 'Job Title', 'Stage', 'Priority',
        'Deal Value', 'Source', 'Industry', 'Location', 'Owner Name', 'Owner Email', 'Description',
        'Tags', 'Last Contacted', 'Next Follow-up', 'Created At',
    ], rows);
}

export function downloadLeadsCsv(csv: string): void {
    downloadCsv(`ninai_leads_${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
