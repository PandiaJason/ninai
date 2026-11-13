import { exportWorkspaceJson } from './workspace';
import { AppError } from './errors';

export interface GitExportResult {
    canceled?: boolean;
    path?: string;
    committed?: boolean;
    gitAvailable?: boolean;
    message?: string;
}

export async function exportWorkspaceToGit(
    workspaceId: string,
    workspaceName: string,
    message = 'NINAI workspace snapshot',
): Promise<GitExportResult> {
    if (!window.electronAPI?.exportToGit) {
        throw new AppError('UNKNOWN', 'Git export is available in the NINAI desktop app. Download a JSON snapshot in the browser instead.');
    }
    const json = await exportWorkspaceJson(workspaceId);
    return window.electronAPI.exportToGit({ json, workspaceName, message });
}
