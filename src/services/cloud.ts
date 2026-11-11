import { db, type SyncState, type WorkspaceVersion } from '../db';
import { requireUser } from './auth';
import { AppError } from './errors';
import { assertWorkspaceAccess } from './permissions';
import { createWorkspaceVersion } from './versions';

export interface CloudBackupConfig {
    endpoint: string;
    token: string;
    provider: 'cloudflare' | 'custom';
}

const CONFIG_KEY = 'ninai_cloud_backup_config';

export function getCloudBackupConfig(): CloudBackupConfig {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (!raw) return { endpoint: '', token: '', provider: 'cloudflare' };
        const parsed = JSON.parse(raw) as Partial<CloudBackupConfig>;
        return {
            endpoint: parsed.endpoint || '',
            token: parsed.token || '',
            provider: parsed.provider === 'custom' ? 'custom' : 'cloudflare',
        };
    } catch {
        return { endpoint: '', token: '', provider: 'cloudflare' };
    }
}

export function saveCloudBackupConfig(config: CloudBackupConfig): void {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({
        endpoint: config.endpoint.trim().replace(/\/+$/, ''),
        token: config.token.trim(),
        provider: config.provider,
    }));
}

export function cloudBackupConfigured(): boolean {
    const config = getCloudBackupConfig();
    return !!config.endpoint;
}

function headers(config: CloudBackupConfig): HeadersInit {
    return {
        'Content-Type': 'application/json',
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    };
}

async function requireConfig(): Promise<CloudBackupConfig> {
    const config = getCloudBackupConfig();
    if (!config.endpoint) throw new AppError('VALIDATION', 'Add a cloud backup endpoint in Settings → Versions & backup.');
    return config;
}

export async function testCloudConnection(): Promise<{ ok: boolean; message: string }> {
    const config = await requireConfig();
    const response = await fetch(`${config.endpoint}/health`, { headers: headers(config) });
    if (!response.ok) throw new AppError('UNKNOWN', `Cloud backup responded with HTTP ${response.status}.`);
    return { ok: true, message: 'Cloud backup endpoint is reachable.' };
}

export async function uploadWorkspaceBackup(workspaceId: string, message = 'Cloud backup'): Promise<WorkspaceVersion> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const config = await requireConfig();
    const version = await createWorkspaceVersion(workspaceId, message, 'cloud');

    const response = await fetch(`${config.endpoint}/backup/${encodeURIComponent(workspaceId)}`, {
        method: 'POST',
        headers: headers(config),
        body: version.data,
    });
    if (!response.ok) {
        throw new AppError('UNKNOWN', `Cloud upload failed with HTTP ${response.status}.`);
    }

    const state: SyncState = {
        id: workspaceId,
        workspaceId,
        provider: config.provider,
        endpoint: config.endpoint,
        lastSyncedAt: Date.now(),
        lastVersionId: version.id,
        updatedAt: Date.now(),
    };
    await db.syncState.put(state);
    return version;
}

export async function downloadCloudBackup(workspaceId: string): Promise<WorkspaceVersion> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const config = await requireConfig();

    const response = await fetch(`${config.endpoint}/backup/${encodeURIComponent(workspaceId)}/latest`, {
        headers: headers(config),
    });
    if (!response.ok) {
        throw new AppError('UNKNOWN', `Cloud download failed with HTTP ${response.status}.`);
    }
    const json = await response.text();
    let payload: any;
    try {
        payload = JSON.parse(json);
    } catch {
        throw new AppError('VALIDATION', 'The cloud backup is not valid JSON.');
    }
    if (payload?.app !== 'NINAI') {
        throw new AppError('VALIDATION', 'The cloud backup is not a NINAI workspace snapshot.');
    }

    const version: WorkspaceVersion = {
        id: crypto.randomUUID(),
        workspaceId,
        message: `Downloaded from cloud · ${new Date().toLocaleString('en-US')}`,
        kind: 'cloud',
        createdBy: actor.id,
        createdAt: Date.now(),
        data: json,
        size: new Blob([json]).size,
        entityCount: countEntities(payload),
    };
    await db.workspaceVersions.add(version);

    await db.syncState.put({
        id: workspaceId,
        workspaceId,
        provider: config.provider,
        endpoint: config.endpoint,
        lastSyncedAt: Date.now(),
        lastVersionId: version.id,
        updatedAt: Date.now(),
    });
    return version;
}

export async function getSyncState(workspaceId: string): Promise<SyncState | undefined> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    return db.syncState.get(workspaceId);
}

function countEntities(payload: any): number {
    return [
        'notes', 'folders', 'leads', 'leadActivities', 'projects', 'projectMilestones',
        'tasks', 'subtasks', 'taskComments', 'calendarEvents', 'tags', 'recordTags',
        'noteLinks', 'notifications', 'activities', 'followUps',
    ].reduce((sum, key) => sum + (Array.isArray(payload?.[key]) ? payload[key].length : 0), 0);
}
