import { db, type LeadStage } from '../db';
import { AppError } from './errors';
import { assertWorkspaceAccess, requireAdmin } from './permissions';
import { optional, required } from './validation';

export async function createStage(workspaceId: string, input: { name: string; color: string }): Promise<LeadStage> {
    const actor = await requireAdmin();
    await assertWorkspaceAccess(actor, workspaceId);
    const name = required(input.name, 'Stage name', 60);
    const color = optional(input.color, 'Stage colour', 20) || '#0071e3';
    const stages = await db.leadStages.where('workspaceId').equals(workspaceId).toArray();
    if (stages.some(s => s.name.toLowerCase() === name.toLowerCase())) {
        throw new AppError('CONFLICT', 'A stage with that name already exists.');
    }
    const order = stages.reduce((max, s) => Math.max(max, s.order), -1) + 1;
    const stage: LeadStage = {
        id: crypto.randomUUID(),
        workspaceId,
        name,
        color,
        order,
        isWon: 0,
        isLost: 0,
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
    if (stages.some(s => s.id !== stageId && s.name.toLowerCase() === name.toLowerCase())) {
        throw new AppError('CONFLICT', 'A stage with that name already exists.');
    }
    await db.leadStages.update(stageId, { name, color });
}

export async function reorderStage(stageId: string, direction: -1 | 1): Promise<void> {
    const actor = await requireAdmin();
    const stage = await db.leadStages.get(stageId);
    if (!stage) throw new AppError('NOT_FOUND', 'Pipeline stage not found.');
    await assertWorkspaceAccess(actor, stage.workspaceId);
    const stages = (await db.leadStages.where('workspaceId').equals(stage.workspaceId).toArray())
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
    if (stages.length <= 1) throw new AppError('CONFLICT', 'At least one pipeline stage is required.');
    const inUse = await db.leads.where('stageId').equals(stageId).count();
    if (inUse > 0) throw new AppError('CONFLICT', 'Move leads out of this stage before deleting it.');
    await db.leadStages.delete(stageId);
}
