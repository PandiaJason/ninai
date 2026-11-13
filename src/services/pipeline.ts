import { db, type LeadAudience, type LeadStage } from '../db';
import { ensureAlgoPipelines, stageAudience } from './algo';
import { logActivity } from './activity';
import { AppError } from './errors';
import { assertWorkspaceAccess, requireAdmin } from './permissions';
import { optional, required } from './validation';

export async function applyAlgoPipelines(workspaceId: string): Promise<void> {
    const actor = await requireAdmin();
    await assertWorkspaceAccess(actor, workspaceId);
    await ensureAlgoPipelines(workspaceId);
    await logActivity({
        workspaceId,
        userId: actor.id,
        entityType: 'lead',
        entityId: workspaceId,
        action: 'pipeline_template_applied',
        title: 'Applied the ALGO learner and institution pipeline template',
    });
}

export async function createStage(
    workspaceId: string,
    input: { name: string; color: string; audience?: LeadAudience },
): Promise<LeadStage> {
    const actor = await requireAdmin();
    await assertWorkspaceAccess(actor, workspaceId);
    const name = required(input.name, 'Stage name', 60);
    const color = optional(input.color, 'Stage colour', 20) || '#0071e3';
    const audience: LeadAudience = input.audience === 'institution' ? 'institution' : 'learner';
    const stages = await db.leadStages.where('workspaceId').equals(workspaceId).toArray();
    const pipeline = stages.filter(stage => stageAudience(stage) === audience);
    if (pipeline.some(s => s.name.toLowerCase() === name.toLowerCase())) {
        throw new AppError('CONFLICT', 'A stage with that name already exists in this pipeline.');
    }
    const order = pipeline.reduce((max, s) => Math.max(max, s.order), -1) + 1;
    const stage: LeadStage = {
        id: crypto.randomUUID(),
        workspaceId,
        name,
        color,
        order,
        isWon: 0,
        isLost: 0,
        audience,
    };
    await db.leadStages.add(stage);
    return stage;
}

export async function updateStage(stageId: string, input: { name: string; color: string }): Promise<void> {
    const actor = await requireAdmin();
    const stage = await db.leadStages.get(stageId);
    if (!stage) throw new AppError('NOT_FOUND', 'Pipeline stage not found.');
    await assertWorkspaceAccess(actor, stage.workspaceId);
    const name = required(input.name, 'Stage name', 60);
    const color = optional(input.color, 'Stage colour', 20) || stage.color;
    const stages = await db.leadStages.where('workspaceId').equals(stage.workspaceId).toArray();
    if (stages.some(s => s.id !== stageId && stageAudience(s) === stageAudience(stage) && s.name.toLowerCase() === name.toLowerCase())) {
        throw new AppError('CONFLICT', 'A stage with that name already exists in this pipeline.');
    }
    await db.leadStages.update(stageId, { name, color });
}

export async function reorderStage(stageId: string, direction: -1 | 1): Promise<void> {
    const actor = await requireAdmin();
    const stage = await db.leadStages.get(stageId);
    if (!stage) throw new AppError('NOT_FOUND', 'Pipeline stage not found.');
    await assertWorkspaceAccess(actor, stage.workspaceId);
    const stages = (await db.leadStages.where('workspaceId').equals(stage.workspaceId).toArray())
        .filter(item => stageAudience(item) === stageAudience(stage))
        .sort((a, b) => a.order - b.order);
    const index = stages.findIndex(s => s.id === stageId);
    const target = stages[index + direction];
    if (!target) return;
    await db.transaction('rw', db.leadStages, async () => {
        await db.leadStages.update(stage.id, { order: target.order });
        await db.leadStages.update(target.id, { order: stage.order });
    });
}

export async function deleteStage(stageId: string): Promise<void> {
    const actor = await requireAdmin();
    const stage = await db.leadStages.get(stageId);
    if (!stage) throw new AppError('NOT_FOUND', 'Pipeline stage not found.');
    await assertWorkspaceAccess(actor, stage.workspaceId);
    const stages = await db.leadStages.where('workspaceId').equals(stage.workspaceId).toArray();
    const pipeline = stages.filter(item => stageAudience(item) === stageAudience(stage));
    if (pipeline.length <= 1) throw new AppError('CONFLICT', 'At least one stage is required in each pipeline.');
    const inUse = await db.leads.where('stageId').equals(stageId).count();
    if (inUse > 0) throw new AppError('CONFLICT', 'Move leads out of this stage before deleting it.');
    await db.leadStages.delete(stageId);
}
