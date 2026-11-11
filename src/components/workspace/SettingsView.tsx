import React, { useEffect, useState } from 'react';
import { createUser, changeOwnPassword, hasDefaultAdminPassword, setUserActive, updateOwnProfile, updateUserRole } from '../../services/auth';
import {
    addWorkspaceMember,
    createWorkspace,
    deleteWorkspace,
    exportWorkspaceJson,
    getWorkspaceStats,
    listNonMembers,
    removeWorkspaceMember,
    updateWorkspace,
    type WorkspaceUser,
} from '../../services/workspace';
import { createStage, deleteStage, reorderStage, updateStage } from '../../services/pipeline';
import { applyAlgoTemplate } from '../../services/algoSetup';
import { stagesForAudience } from '../../services/algo';
import { listLeadStages } from '../../services/leads';
import {
    createWorkspaceVersion,
    deleteWorkspaceVersion,
    listWorkspaceVersions,
    restoreWorkspaceVersion,
    saveSnapshotFile,
    type WorkspaceVersionWithUser,
} from '../../services/versions';
import { exportWorkspaceToGit } from '../../services/git';
import {
    connectGmail,
    disconnectGmail,
    getGmailConnection,
} from '../../services/gmailSync';
import { buildGoogleAuthUrl, createPkcePair } from '../../services/gmail';
import {
    downloadCloudBackup,
    getCloudBackupConfig,
    getSyncState,
    saveCloudBackupConfig,
    testCloudConnection,
    uploadWorkspaceBackup,
    type CloudBackupConfig,
} from '../../services/cloud';
import { DEFAULT_WORKSPACE_ID, type LeadAudience, type UserRole } from '../../db';
import { formatDate, formatDateTime } from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Badge, Button, ConfirmDialog, IconButton, PageHeader, SectionCard, StatCard } from '../ui/Misc';
import { Icon, type IconName } from '../ui/Icon';
import { Field, Select, TextArea, TextInput } from '../ui/Form';
import { useToast } from '../ui/Toast';
import { useAsyncData } from './useAsyncData';

type SettingsSection = 'profile' | 'workspace' | 'people' | 'pipeline' | 'gmail' | 'data' | 'versions';

const SECTIONS: { id: SettingsSection; label: string; icon: IconName }[] = [
    { id: 'profile', label: 'Profile', icon: 'user' },
    { id: 'workspace', label: 'Workspace', icon: 'building' },
    { id: 'people', label: 'People', icon: 'users' },
    { id: 'pipeline', label: 'Pipeline', icon: 'kanban' },
    { id: 'gmail', label: 'Gmail', icon: 'mail' },
    { id: 'data', label: 'Data', icon: 'file' },
    { id: 'versions', label: 'Versions & backup', icon: 'history' },
];

export const SettingsView: React.FC = () => {
    const { user, workspace, workspaces, members, refreshAuth, refreshWorkspaces, refreshMembers, switchWorkspace, logout } = useAuth();
    const toast = useToast();
    const [section, setSection] = useState<SettingsSection>('profile');
    const isAdmin = user?.role === 'admin';
    const workspaceId = workspace?.id || '';

    const { data, loading, error, reload } = useAsyncData(async () => {
        if (!workspaceId) return null;
        const [stats, stages, nonMembers] = await Promise.all([
            getWorkspaceStats(workspaceId),
            listLeadStages(workspaceId),
            user?.role === 'admin' ? listNonMembers(workspaceId) : Promise.resolve([] as WorkspaceUser[]),
        ]);
        return { stats, stages, nonMembers };
    }, [workspaceId, user?.role]);

    return (
        <div className="ws-module">
            <div className="ws-module-inner">
                <PageHeader
                    eyebrow="Administration"
                    title="Settings"
                    subtitle="Manage your profile, workspace, people and CRM pipeline. Admin permissions are enforced by the domain layer."
                />

                <div className="ws-settings-layout">
                    <nav className="ws-settings-nav">
                        {SECTIONS.map(item => (
                            <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>
                                <Icon name={item.icon} size={14} /> {item.label}
                            </button>
                        ))}
                    </nav>

                    <div className="ws-settings-pane">
                        {error && <div className="ws-inline-error"><Icon name="alert" size={16} /><span>{error}</span><button onClick={() => void reload()}>Retry</button></div>}

                        {section === 'profile' && user && (
                            <ProfileSection
                                user={user}
                                onSaved={async () => { await refreshAuth(); }}
                            />
                        )}

                        {section === 'workspace' && (
                            <WorkspaceSection
                                activeId={workspaceId}
                                workspaces={workspaces}
                                isAdmin={isAdmin}
                                userId={user?.id || ''}
                                onChanged={async () => { await refreshWorkspaces(); }}
                                onSwitch={async id => { await switchWorkspace(id); toast.success('Workspace switched.'); }}
                            />
                        )}

                        {section === 'people' && (
                            <PeopleSection
                                workspaceId={workspaceId}
                                members={members}
                                nonMembers={data?.nonMembers || []}
                                isAdmin={isAdmin}
                                currentUserId={user?.id || ''}
                                workspaceOwnerId={workspace?.ownerId || ''}
                                onChanged={async () => { await reload(); await refreshMembers(); }}
                            />
                        )}

                        {section === 'pipeline' && (
                            <PipelineSection
                                workspaceId={workspaceId}
                                stages={data?.stages || []}
                                isAdmin={isAdmin}
                                loading={loading}
                                onChanged={() => void reload()}
                            />
                        )}

                        {section === 'gmail' && workspaceId && (
                            <GmailSection workspaceId={workspaceId} onChanged={() => void reload()} />
                        )}

                        {section === 'data' && (
                            <DataSection
                                stats={data?.stats}
                                isAdmin={isAdmin}
                                onExport={async () => {
                                    try {
                                        const json = await exportWorkspaceJson(workspaceId);
                                        downloadJson(`ninai-workspace-${new Date().toISOString().slice(0, 10)}.json`, json);
                                        toast.success('Workspace data exported.');
                                    } catch (e) {
                                        toast.error(toErrorMessage(e));
                                    }
                                }}
                                onLogout={() => void logout()}
                            />
                        )}

                        {section === 'versions' && workspaceId && (
                            <VersionsSection workspaceId={workspaceId} workspaceName={workspace?.name || 'NINAI workspace'} isAdmin={isAdmin} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

const ProfileSection: React.FC<{ user: NonNullable<ReturnType<typeof useAuth>['user']>; onSaved: () => Promise<void> }> = ({ user, onSaved }) => {
    const toast = useToast();
    const [name, setName] = useState(user.name);
    const [email, setEmail] = useState(user.email);
    const [savingProfile, setSavingProfile] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [nextPassword, setNextPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [savingPassword, setSavingPassword] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setName(user.name);
        setEmail(user.email);
    }, [user.id, user.name, user.email]);

    const saveProfile = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setSavingProfile(true);
        try {
            await updateOwnProfile({ name, email });
            await onSaved();
            toast.success('Profile updated.');
        } catch (e) {
            setError(toErrorMessage(e));
        } finally {
            setSavingProfile(false);
        }
    };

    const savePassword = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        if (nextPassword !== confirmPassword) {
            setError('The new passwords do not match.');
            return;
        }
        setSavingPassword(true);
        try {
            await changeOwnPassword(currentPassword, nextPassword);
            setCurrentPassword('');
            setNextPassword('');
            setConfirmPassword('');
            toast.success('Password changed.');
        } catch (e) {
            setError(toErrorMessage(e));
        } finally {
            setSavingPassword(false);
        }
    };

    return (
        <>
            {error && <div className="ws-form-error"><span>{error}</span></div>}
            <SectionCard title="Your profile" description="Name and email are visible to your workspace.">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <Avatar name={user.name} color={user.avatarColor} size={48} />
                    <div>
                        <div className="ws-user-name">{user.name}</div>
                        <div className="ws-user-email">{user.role === 'admin' ? 'Administrator' : 'Member'} · joined {formatDate(user.createdAt)}</div>
                    </div>
                </div>
                <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="ws-form-grid">
                        <Field label="Full name" htmlFor="profile-name" required>
                            <TextInput id="profile-name" value={name} onChange={e => setName(e.target.value)} />
                        </Field>
                        <Field label="Email" htmlFor="profile-email" required>
                            <TextInput id="profile-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                        </Field>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button type="submit" variant="primary" loading={savingProfile}>Save profile</Button>
                    </div>
                </form>
            </SectionCard>

            <SectionCard title="Password" description={hasDefaultAdminPassword() ? 'You are still using the default admin password. Change it now.' : 'Use at least 8 characters.'}>
                <form onSubmit={savePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="ws-form-grid">
                        <Field label="Current password" htmlFor="profile-current-password" required>
                            <TextInput id="profile-current-password" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" />
                        </Field>
                        <span />
                        <Field label="New password" htmlFor="profile-new-password" required>
                            <TextInput id="profile-new-password" type="password" value={nextPassword} onChange={e => setNextPassword(e.target.value)} autoComplete="new-password" />
                        </Field>
                        <Field label="Confirm new password" htmlFor="profile-confirm-password" required>
                            <TextInput id="profile-confirm-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" />
                        </Field>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button type="submit" variant="primary" loading={savingPassword} disabled={!currentPassword || !nextPassword}>Change password</Button>
                    </div>
                </form>
            </SectionCard>
        </>
    );
};

/* ------------------------------------------------------------------ */
/* Workspace                                                           */
/* ------------------------------------------------------------------ */

const WorkspaceSection: React.FC<{
    activeId: string;
    workspaces: ReturnType<typeof useAuth>['workspaces'];
    isAdmin: boolean;
    userId: string;
    onChanged: () => Promise<void>;
    onSwitch: (id: string) => Promise<void>;
}> = ({ activeId, workspaces, isAdmin, userId, onChanged, onSwitch }) => {
    const toast = useToast();
    const active = workspaces.find(item => item.id === activeId);
    const [name, setName] = useState(active?.name || '');
    const [description, setDescription] = useState(active?.description || '');
    const [saving, setSaving] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [creating, setCreating] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setName(active?.name || '');
        setDescription(active?.description || '');
    }, [active?.id, active?.name, active?.description]);

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            await updateWorkspace(activeId, { name, description });
            await onChanged();
            toast.success('Workspace updated.');
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    const create = async (event: React.FormEvent) => {
        event.preventDefault();
        setCreating(true);
        try {
            const created = await createWorkspace({ name: newName, description: newDescription });
            setNewName('');
            setNewDescription('');
            await onChanged();
            toast.success('Workspace created.');
            await onSwitch(created.id);
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setCreating(false);
        }
    };

    const remove = async () => {
        if (!deleteTarget) return;
        setBusy(true);
        try {
            await deleteWorkspace(deleteTarget);
            setDeleteTarget(null);
            await onChanged();
            toast.success('Workspace deleted.');
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <SectionCard title="Your workspaces" description="Switch between workspaces. Data is separated per workspace.">
                {workspaces.map(item => (
                    <div key={item.id} className="ws-workspace-row">
                        <span className="ws-search-result-icon" style={{ width: 32, height: 32 }}><Icon name="building" size={14} /></span>
                        <div className="ws-user-info">
                            <div className="ws-user-name">{item.name}{item.id === activeId ? ' · Current' : ''}</div>
                            <div className="ws-user-email">{item.memberCount} member{item.memberCount === 1 ? '' : 's'} · {item.role}</div>
                        </div>
                        {item.id === activeId ? (
                            <Badge tone="blue">Active</Badge>
                        ) : (
                            <Button size="sm" onClick={() => void onSwitch(item.id)}>Switch</Button>
                        )}
                        {isAdmin && item.id !== DEFAULT_WORKSPACE_ID && item.ownerId === userId && (
                            <IconButton icon="trash" label="Delete workspace" danger onClick={() => setDeleteTarget(item.id)} />
                        )}
                    </div>
                ))}
            </SectionCard>

            {active && (
                <SectionCard title="Workspace details" description="Only owners and admins can edit these details.">
                    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <Field label="Name" htmlFor="workspace-name" required>
                            <TextInput id="workspace-name" value={name} onChange={e => setName(e.target.value)} disabled={!isAdmin} />
                        </Field>
                        <Field label="Description" htmlFor="workspace-description">
                            <TextArea id="workspace-description" value={description} onChange={e => setDescription(e.target.value)} disabled={!isAdmin} />
                        </Field>
                        {isAdmin && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <Button type="submit" variant="primary" loading={saving}>Save workspace</Button>
                            </div>
                        )}
                    </form>
                </SectionCard>
            )}

            {isAdmin && (
                <SectionCard title="New workspace" description="Creates a separate space with its own notes folder, pipeline and data.">
                    <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div className="ws-form-grid">
                            <Field label="Workspace name" htmlFor="new-workspace-name" required>
                                <TextInput id="new-workspace-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Client delivery" />
                            </Field>
                            <Field label="Description" htmlFor="new-workspace-description">
                                <TextInput id="new-workspace-description" value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Optional" />
                            </Field>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <Button type="submit" variant="primary" icon="plus" loading={creating} disabled={!newName.trim()}>Create workspace</Button>
                        </div>
                    </form>
                </SectionCard>
            )}

            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete workspace?"
                message="This permanently deletes the workspace and all of its notes, leads, tasks and activity. This cannot be undone."
                confirmLabel="Delete workspace"
                danger
                busy={busy}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={() => void remove()}
            />
        </>
    );
};

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

const PeopleSection: React.FC<{
    workspaceId: string;
    members: WorkspaceUser[];
    nonMembers: WorkspaceUser[];
    isAdmin: boolean;
    currentUserId: string;
    workspaceOwnerId: string;
    onChanged: () => Promise<void>;
}> = ({ workspaceId, members, nonMembers, isAdmin, currentUserId, workspaceOwnerId, onChanged }) => {
    const toast = useToast();
    const [addUserId, setAddUserId] = useState('');
    const [removeTarget, setRemoveTarget] = useState<WorkspaceUser | null>(null);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member' as UserRole });
    const [creating, setCreating] = useState(false);

    const changeRole = async (member: WorkspaceUser, role: UserRole) => {
        try {
            await updateUserRole(member.id, role);
            toast.success('Role updated.');
            await onChanged();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const toggleActive = async (member: WorkspaceUser) => {
        try {
            await setUserActive(member.id, member.active !== 1);
            toast.success(member.active === 1 ? 'Account deactivated.' : 'Account reactivated.');
            await onChanged();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const addExisting = async () => {
        if (!addUserId) return;
        setBusy(true);
        try {
            await addWorkspaceMember(workspaceId, addUserId);
            setAddUserId('');
            toast.success('Member added.');
            await onChanged();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!removeTarget) return;
        setBusy(true);
        try {
            await removeWorkspaceMember(workspaceId, removeTarget.id);
            setRemoveTarget(null);
            toast.success('Member removed.');
            await onChanged();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const create = async (event: React.FormEvent) => {
        event.preventDefault();
        setCreating(true);
        try {
            await createUser({ ...form, workspaceId });
            setForm({ name: '', email: '', password: '', role: 'member' });
            toast.success('User created and added to this workspace.');
            await onChanged();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setCreating(false);
        }
    };

    return (
        <>
            <SectionCard title="Workspace members" description={`${members.length} member${members.length === 1 ? '' : 's'}`}>
                {members.map(member => (
                    <div key={member.id} className="ws-user-row">
                        <Avatar name={member.name} color={member.avatarColor} size={30} />
                        <div className="ws-user-info">
                            <div className="ws-user-name">{member.name}{member.id === currentUserId ? ' · You' : ''}</div>
                            <div className="ws-user-email">{member.email}</div>
                        </div>
                        {member.active === 1 ? <Badge tone="green">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
                        {member.role === 'owner' ? (
                            <Badge tone="purple">Owner</Badge>
                        ) : isAdmin ? (
                            <Select value={member.role} onChange={e => void changeRole(member, e.target.value as UserRole)} aria-label={`Role for ${member.name}`} style={{ width: 110 }}>
                                <option value="admin">Admin</option>
                                <option value="member">Member</option>
                            </Select>
                        ) : (
                            <Badge tone="blue">{member.role === 'admin' ? 'Admin' : 'Member'}</Badge>
                        )}
                        {isAdmin && member.id !== currentUserId && member.id !== workspaceOwnerId && (
                            <div className="ws-user-actions">
                                <IconButton
                                    icon={member.active === 1 ? 'lock' : 'check'}
                                    label={member.active === 1 ? 'Deactivate account' : 'Reactivate account'}
                                    onClick={() => void toggleActive(member)}
                                />
                                <IconButton icon="x" label={`Remove ${member.name}`} danger onClick={() => setRemoveTarget(member)} />
                            </div>
                        )}
                    </div>
                ))}
            </SectionCard>

            {isAdmin && (
                <SectionCard title="Add existing user" description="Users must already exist in this NINAI installation.">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                            <Field label="User" htmlFor="add-existing-user">
                                <Select id="add-existing-user" value={addUserId} onChange={e => setAddUserId(e.target.value)}>
                                    <option value="">Select a user…</option>
                                    {nonMembers.map(item => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}
                                </Select>
                            </Field>
                        </div>
                        <Button icon="plus" loading={busy} disabled={!addUserId} onClick={() => void addExisting()}>Add to workspace</Button>
                    </div>
                    {nonMembers.length === 0 && <p className="ws-muted" style={{ marginTop: 8 }}>Every existing user is already a member of this workspace.</p>}
                </SectionCard>
            )}

            {isAdmin && (
                <SectionCard title="Create user" description="Creates a local account and adds it to this workspace.">
                    <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div className="ws-form-grid">
                            <Field label="Full name" htmlFor="new-user-name" required>
                                <TextInput id="new-user-name" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} />
                            </Field>
                            <Field label="Email" htmlFor="new-user-email" required>
                                <TextInput id="new-user-email" type="email" value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} />
                            </Field>
                            <Field label="Temporary password" htmlFor="new-user-password" required hint="At least 8 characters.">
                                <TextInput id="new-user-password" type="password" value={form.password} onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))} autoComplete="new-password" />
                            </Field>
                            <Field label="Role" htmlFor="new-user-role">
                                <Select id="new-user-role" value={form.role} onChange={e => setForm(prev => ({ ...prev, role: e.target.value as UserRole }))}>
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                </Select>
                            </Field>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <Button type="submit" variant="primary" icon="plus" loading={creating} disabled={!form.name.trim() || !form.email.trim() || form.password.length < 8}>Create user</Button>
                        </div>
                    </form>
                </SectionCard>
            )}

            <ConfirmDialog
                open={!!removeTarget}
                title="Remove member?"
                message={`${removeTarget?.name || 'This person'} will lose access to this workspace. Their account and authored records are kept.`}
                confirmLabel="Remove member"
                danger
                busy={busy}
                onCancel={() => setRemoveTarget(null)}
                onConfirm={() => void remove()}
            />
        </>
    );
};

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

const PipelineSection: React.FC<{
    workspaceId: string;
    stages: Awaited<ReturnType<typeof listLeadStages>>;
    isAdmin: boolean;
    loading: boolean;
    onChanged: () => void;
}> = ({ workspaceId, stages, isAdmin, loading, onChanged }) => {
    const toast = useToast();
    const [audience, setAudience] = useState<LeadAudience>('learner');
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState('#0071e3');
    const [busy, setBusy] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState('#0071e3');
    const audienceStages = stagesForAudience(stages, audience);

    const applyTemplate = async () => {
        setBusy(true);
        try {
            const result = await applyAlgoTemplate(workspaceId);
            toast.success(result.createdProject ? 'ALGO pipelines and first-cohort project created.' : 'ALGO pipelines applied.');
            onChanged();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const startEdit = (stage: Awaited<ReturnType<typeof listLeadStages>>[number]) => {
        setEditingId(stage.id);
        setEditName(stage.name);
        setEditColor(stage.color);
    };

    const saveEdit = async () => {
        if (!editingId) return;
        setBusy(true);
        try {
            await updateStage(editingId, { name: editName, color: editColor });
            setEditingId(null);
            toast.success('Stage updated.');
            onChanged();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const addStage = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        try {
            await createStage(workspaceId, { name: newName, color: newColor, audience });
            setNewName('');
            toast.success('Stage added.');
            onChanged();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const move = async (stageId: string, direction: -1 | 1) => {
        try {
            await reorderStage(stageId, direction);
            onChanged();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const remove = async (stageId: string) => {
        try {
            await deleteStage(stageId);
            toast.success('Stage deleted.');
            onChanged();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    return (
        <SectionCard
            title="ALGO pipelines"
            description="Learners and institutions have separate stages. Quality is recorded on the record, not inferred from the stage."
            action={isAdmin ? (
                <Button size="sm" icon="sparkles" loading={busy} onClick={() => void applyTemplate()}>
                    Apply ALGO template
                </Button>
            ) : undefined}
        >
            <div className="ws-pipeline-tabs" role="tablist" aria-label="Pipeline to edit">
                <button className={audience === 'learner' ? 'active' : ''} onClick={() => setAudience('learner')} role="tab" aria-selected={audience === 'learner'}>
                    <Icon name="users" size={14} /> Learners <span>{stagesForAudience(stages, 'learner').length}</span>
                </button>
                <button className={audience === 'institution' ? 'active' : ''} onClick={() => setAudience('institution')} role="tab" aria-selected={audience === 'institution'}>
                    <Icon name="building" size={14} /> Institutions <span>{stagesForAudience(stages, 'institution').length}</span>
                </button>
            </div>

            {loading && <p className="ws-muted">Loading stages…</p>}
            {!loading && audienceStages.map((stage, index) => (
                <div key={stage.id} className="ws-stage-row">
                    <span className="ws-stage-color" style={{ background: stage.color }} />
                    {editingId === stage.id ? (
                        <>
                            <TextInput value={editName} onChange={e => setEditName(e.target.value)} style={{ flex: 1 }} />
                            <TextInput type="color" value={editColor} onChange={e => setEditColor(e.target.value)} style={{ width: 44, padding: 2 }} />
                            <Button size="sm" variant="primary" loading={busy} onClick={() => void saveEdit()}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                        </>
                    ) : (
                        <>
                            <span className="ws-stage-name">
                                {stage.name}
                                {stage.isWon === 1 && <Badge tone="green">{audience === 'learner' ? 'Feedback / success' : 'Won'}</Badge>}
                                {stage.isLost === 1 && <Badge tone="neutral">{audience === 'learner' ? 'Not fit' : 'Lost'}</Badge>}
                            </span>
                            {isAdmin && (
                                <div className="ws-user-actions">
                                    <IconButton icon="chevron-up" label="Move earlier" disabled={index === 0} onClick={() => void move(stage.id, -1)} />
                                    <IconButton icon="chevron-down" label="Move later" disabled={index === audienceStages.length - 1} onClick={() => void move(stage.id, 1)} />
                                    <IconButton icon="edit" label="Edit stage" onClick={() => startEdit(stage)} />
                                    <IconButton icon="trash" label="Delete stage" danger disabled={audienceStages.length <= 1} onClick={() => void remove(stage.id)} />
                                </div>
                            )}
                        </>
                    )}
                </div>
            ))}
            {isAdmin && (
                <form onSubmit={addStage} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 14 }}>
                    <div style={{ flex: 1 }}>
                        <Field label="New stage" htmlFor="new-stage-name">
                            <TextInput id="new-stage-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder={audience === 'learner' ? 'e.g. Re-engaged' : 'e.g. Pilot scoping'} />
                        </Field>
                    </div>
                    <TextInput type="color" aria-label="Stage colour" value={newColor} onChange={e => setNewColor(e.target.value)} style={{ width: 44, padding: 2 }} />
                    <Button type="submit" icon="plus" loading={busy} disabled={!newName.trim()}>Add stage</Button>
                </form>
            )}
            {isAdmin && (
                <p className="ws-muted" style={{ marginTop: 14, fontSize: 12 }}>
                    Applying the ALGO template also creates the shared “ALGO — First Cohort” project with milestones, tasks, a working note and a review follow-up. Existing leads are preserved.
                </p>
            )}
        </SectionCard>
    );
};

/* ------------------------------------------------------------------ */
/* Versions & backup                                                   */
/* ------------------------------------------------------------------ */

const VersionsSection: React.FC<{ workspaceId: string; workspaceName: string; isAdmin: boolean }> = ({ workspaceId, workspaceName, isAdmin }) => {
    const toast = useToast();
    const [message, setMessage] = useState('Manual snapshot');
    const [busy, setBusy] = useState(false);
    const [gitBusy, setGitBusy] = useState(false);
    const [restoring, setRestoring] = useState<WorkspaceVersionWithUser | null>(null);
    const [deleting, setDeleting] = useState<WorkspaceVersionWithUser | null>(null);
    const [config, setConfig] = useState<CloudBackupConfig>(() => getCloudBackupConfig());
    const [showToken, setShowToken] = useState(false);
    const [cloudBusy, setCloudBusy] = useState('');
    const { data, loading, error, reload } = useAsyncData(async () => {
        const [versions, sync] = await Promise.all([
            listWorkspaceVersions(workspaceId, 50),
            getSyncState(workspaceId),
        ]);
        return { versions, sync };
    }, [workspaceId]);
    const versions = data?.versions || [];
    const sync = data?.sync;

    const create = async () => {
        setBusy(true);
        try {
            await createWorkspaceVersion(workspaceId, message, 'manual');
            toast.success('Version saved locally.');
            setMessage('Manual snapshot');
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const restore = async () => {
        if (!restoring) return;
        setBusy(true);
        try {
            await restoreWorkspaceVersion(restoring.id);
            toast.success('Version restored. A safety snapshot was saved first.');
            setRestoring(null);
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!deleting) return;
        setBusy(true);
        try {
            await deleteWorkspaceVersion(deleting.id);
            toast.success('Version deleted.');
            setDeleting(null);
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const download = async (version: WorkspaceVersionWithUser) => {
        try {
            await saveSnapshotFile(version.id);
            toast.success('Snapshot downloaded.');
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const exportGit = async () => {
        setGitBusy(true);
        try {
            const result = await exportWorkspaceToGit(workspaceId, workspaceName, message || 'NINAI workspace snapshot');
            if (result.canceled) return;
            if (result.gitAvailable === false) toast.error(result.message || 'Snapshot written, but Git was not found.');
            else toast.success(result.committed ? `Committed to ${result.path}` : result.message || 'Snapshot written to Git folder.');
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setGitBusy(false);
        }
    };

    const saveCloud = () => {
        saveCloudBackupConfig(config);
        setConfig(getCloudBackupConfig());
        toast.success('Cloud backup settings saved on this device.');
    };

    const testCloud = async () => {
        setCloudBusy('test');
        try {
            const result = await testCloudConnection();
            toast.success(result.message);
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setCloudBusy('');
        }
    };

    const upload = async () => {
        setCloudBusy('upload');
        try {
            saveCloudBackupConfig(config);
            await uploadWorkspaceBackup(workspaceId, 'Cloud backup');
            toast.success('Workspace uploaded to cloud backup.');
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setCloudBusy('');
        }
    };

    const downloadCloud = async () => {
        setCloudBusy('download');
        try {
            saveCloudBackupConfig(config);
            await downloadCloudBackup(workspaceId);
            toast.success('Cloud backup downloaded. Restore it from the version list when ready.');
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setCloudBusy('');
        }
    };

    return (
        <>
            <SectionCard
                title="Version history"
                description="Local snapshots of this workspace. Restoring keeps a safety copy first, so you can always go back."
            >
                <div className="ws-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                    <StatCard label="Versions" value={versions.length} icon="history" />
                    <StatCard label="Latest" value={versions[0] ? formatDate(versions[0].createdAt) : '—'} hint={versions[0]?.message} icon="git-branch" tone="purple" />
                    <StatCard label="Cloud sync" value={sync?.lastSyncedAt ? formatDate(sync.lastSyncedAt) : 'Not yet'} hint={sync?.endpoint || 'Configure an endpoint below'} icon="cloud" tone={sync?.lastSyncedAt ? 'green' : 'neutral'} />
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <Field label="Snapshot message" htmlFor="version-message" className="ws-grow">
                        <TextInput
                            id="version-message"
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="e.g. Before redesigning the pipeline"
                        />
                    </Field>
                    <Button variant="primary" icon="history" loading={busy} onClick={() => void create()}>Save version</Button>
                </div>

                {error && <div className="ws-inline-error" style={{ marginTop: 14 }}><Icon name="alert" size={16} /><span>{error}</span><button onClick={() => void reload()}>Retry</button></div>}
                {loading && <p className="ws-muted" style={{ marginTop: 14 }}>Loading versions…</p>}
                {!loading && !error && versions.length === 0 && (
                    <p className="ws-muted" style={{ marginTop: 14 }}>No versions yet. Save the first snapshot before a big change.</p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
                    {versions.map(version => (
                        <div key={version.id} className="ws-user-row">
                            <span className="ws-search-result-icon" style={{ width: 30, height: 30, flex: '0 0 auto' }}>
                                <Icon name={version.kind === 'cloud' ? 'cloud' : 'git-branch'} size={14} />
                            </span>
                            <div className="ws-user-info">
                                <div className="ws-user-name">{version.message}</div>
                                <div className="ws-user-email">
                                    {version.kind} · {version.authorName} · {formatDateTime(version.createdAt)} · {version.entityCount} records · {formatBytes(version.size)}
                                </div>
                            </div>
                            <div className="ws-user-actions">
                                <IconButton icon="download" label="Download snapshot" onClick={() => void download(version)} />
                                <IconButton icon="refresh" label="Restore version" disabled={!isAdmin} onClick={() => setRestoring(version)} />
                                <IconButton icon="trash" label="Delete version" danger disabled={!isAdmin} onClick={() => setDeleting(version)} />
                            </div>
                        </div>
                    ))}
                </div>
                {!isAdmin && <p className="ws-muted" style={{ marginTop: 10 }}>Only admins can restore or delete versions. Members can still save and download snapshots.</p>}
            </SectionCard>

            <SectionCard
                title="Git repository"
                description="Write the workspace as plain JSON into a folder and commit it with Git. Use any private repository you already trust."
            >
                <div className="ws-info-list" style={{ marginBottom: 14 }}>
                    <div className="ws-info-row"><Icon name="git-branch" size={14} /><span className="ws-info-label">Desktop only</span><span className="ws-info-value">NINAI creates <code>ninai-workspace.json</code> and <code>README.md</code>, initialises Git if needed, then commits the snapshot.</span></div>
                    <div className="ws-info-row"><Icon name="lock" size={14} /><span className="ws-info-label">No credentials</span><span className="ws-info-value">The commit uses your local Git identity. NINAI never asks for or stores a Git token.</span></div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <Field label="Commit message" htmlFor="git-message" className="ws-grow">
                        <TextInput id="git-message" value={message} onChange={e => setMessage(e.target.value)} placeholder="Snapshot message" />
                    </Field>
                    <Button icon="git-branch" loading={gitBusy} onClick={() => void exportGit()}>Export to Git…</Button>
                </div>
            </SectionCard>

            <SectionCard
                title="Cloud backup"
                description="Upload the same versioned snapshot to a private endpoint. NINAI stays local-first; the cloud is an explicit backup, not live sync."
            >
                <div className="ws-form-grid">
                    <Field label="Provider" htmlFor="cloud-provider">
                        <Select
                            id="cloud-provider"
                            value={config.provider}
                            onChange={e => setConfig(prev => ({ ...prev, provider: e.target.value as CloudBackupConfig['provider'] }))}
                        >
                            <option value="cloudflare">Cloudflare Worker + R2</option>
                            <option value="custom">Custom endpoint</option>
                        </Select>
                    </Field>
                    <Field label="Endpoint" htmlFor="cloud-endpoint" hint="Base URL, e.g. https://ninai-backup.example.workers.dev">
                        <TextInput
                            id="cloud-endpoint"
                            value={config.endpoint}
                            onChange={e => setConfig(prev => ({ ...prev, endpoint: e.target.value }))}
                            placeholder="https://your-worker.workers.dev"
                        />
                    </Field>
                    <Field label="Access token" htmlFor="cloud-token" hint="Sent as Authorization: Bearer …">
                        <div style={{ display: 'flex', gap: 6 }}>
                            <TextInput
                                id="cloud-token"
                                type={showToken ? 'text' : 'password'}
                                value={config.token}
                                onChange={e => setConfig(prev => ({ ...prev, token: e.target.value }))}
                                placeholder="Backup token"
                                autoComplete="off"
                            />
                            <IconButton icon="eye" label={showToken ? 'Hide token' : 'Show token'} onClick={() => setShowToken(value => !value)} />
                        </div>
                    </Field>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    <Button icon="check" onClick={saveCloud}>Save settings</Button>
                    <Button icon="cloud" loading={cloudBusy === 'test'} onClick={() => void testCloud()}>Test connection</Button>
                    <Button variant="primary" icon="upload" loading={cloudBusy === 'upload'} disabled={!isAdmin || !config.endpoint} onClick={() => void upload()}>Upload now</Button>
                    <Button icon="download" loading={cloudBusy === 'download'} disabled={!isAdmin || !config.endpoint} onClick={() => void downloadCloud()}>Download latest</Button>
                </div>
                <p className="ws-muted" style={{ marginTop: 10 }}>
                    The endpoint receives a JSON snapshot at <code>/backup/:workspaceId</code> and returns the latest at <code>/backup/:workspaceId/latest</code>. The included Worker scaffold implements both routes.
                </p>
            </SectionCard>

            <ConfirmDialog
                open={!!restoring}
                title="Restore this version?"
                message={restoring ? `“${restoring.message}” will replace the current workspace records. A safety snapshot is saved automatically before restoring.` : ''}
                confirmLabel="Restore version"
                onConfirm={() => void restore()}
                onCancel={() => setRestoring(null)}
                busy={busy}
            />

            <ConfirmDialog
                open={!!deleting}
                title="Delete this version?"
                message={deleting ? `“${deleting.message}” will be removed from local version history.` : ''}
                confirmLabel="Delete version"
                danger
                onConfirm={() => void remove()}
                onCancel={() => setDeleting(null)}
                busy={busy}
            />
        </>
    );
};

function formatBytes(value: number): string {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

const DataSection: React.FC<{
    stats: Awaited<ReturnType<typeof getWorkspaceStats>> | undefined;
    isAdmin: boolean;
    onExport: () => Promise<void>;
    onLogout: () => void;
}> = ({ stats, isAdmin, onExport, onLogout }) => (
    <>
        <SectionCard title="Workspace data" description="Counts of records stored locally in this workspace.">
            <div className="ws-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                <StatCard label="Notes" value={stats?.notes ?? 0} icon="notes" />
                <StatCard label="Leads" value={stats?.leads ?? 0} icon="crm" tone="blue" />
                <StatCard label="Projects" value={stats?.projects ?? 0} icon="projects" tone="purple" />
                <StatCard label="Tasks" value={stats?.tasks ?? 0} icon="tasks" tone="green" />
                <StatCard label="Follow-ups" value={stats?.followUps ?? 0} icon="followups" tone="orange" />
                <StatCard label="Events" value={stats?.events ?? 0} icon="calendar" tone="orange" />
                <StatCard label="People" value={stats?.members ?? 0} icon="users" />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <Button icon="download" onClick={() => void onExport()} disabled={!isAdmin}>Export workspace JSON</Button>
                <Button variant="danger" icon="logout" onClick={onLogout}>Sign out</Button>
            </div>
            {!isAdmin && <p className="ws-muted" style={{ marginTop: 10 }}>Only admins can export full workspace data.</p>}
        </SectionCard>

        <SectionCard title="Storage & limitations" description="NINAI is local-first.">
            <div className="ws-info-list">
                <div className="ws-info-row"><Icon name="lock" size={14} /><span className="ws-info-label">Storage</span><span className="ws-info-value">All records live in this browser profile (IndexedDB). Nothing is uploaded.</span></div>
                <div className="ws-info-row"><Icon name="users" size={14} /><span className="ws-info-label">Accounts</span><span className="ws-info-value">Multiple local accounts are supported, but there is no network sync between devices or people.</span></div>
                <div className="ws-info-row"><Icon name="alert" size={14} /><span className="ws-info-label">Security</span><span className="ws-info-value">Permissions are enforced by the domain layer. Local administrator access to the browser profile can still bypass the UI.</span></div>
            </div>
        </SectionCard>
    </>
);

/* ------------------------------------------------------------------ */
/* Gmail                                                                */
/* ------------------------------------------------------------------ */

const GMAIL_CLIENT_ID_KEY = 'ninai_gmail_client_id';

const GmailSection: React.FC<{ workspaceId: string; onChanged: () => void }> = ({ workspaceId, onChanged }) => {
    const toast = useToast();
    const [clientId, setClientId] = useState(() => localStorage.getItem(GMAIL_CLIENT_ID_KEY) || '');
    const [connecting, setConnecting] = useState(false);
    const [connection, setConnection] = useState<Awaited<ReturnType<typeof getGmailConnection>>>(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        void getGmailConnection(workspaceId)
            .then(value => { if (!cancelled) setConnection(value); })
            .catch(() => { if (!cancelled) setConnection(undefined); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [workspaceId]);

    const saveClientId = () => {
        const value = clientId.trim();
        if (value) localStorage.setItem(GMAIL_CLIENT_ID_KEY, value);
        else localStorage.removeItem(GMAIL_CLIENT_ID_KEY);
        setClientId(value);
    };

    const connect = async () => {
        setError('');
        const api = window.electronAPI?.gmailOAuth;
        if (!api) {
            setError('Google sign-in needs the Ninai desktop app. Open the project with Electron and try again.');
            return;
        }
        if (!clientId.trim()) {
            setError('Add a Google OAuth desktop client id first.');
            return;
        }
        setConnecting(true);
        try {
            saveClientId();
            const { verifier, challenge } = await createPkcePair();
            const state = crypto.randomUUID();
            const { requestId, redirectUri } = await api.start();
            const url = buildGoogleAuthUrl({ clientId: clientId.trim(), redirectUri, state, codeChallenge: challenge });
            await window.electronAPI?.openExternal?.(url);
            const code = await api.complete(requestId);
            const created = await connectGmail({ workspaceId, clientId: clientId.trim(), code, codeVerifier: verifier, redirectUri });
            setConnection(created);
            toast.success(`Connected ${created.email}.`);
            onChanged();
        } catch (e) {
            setError(toErrorMessage(e));
        } finally {
            setConnecting(false);
        }
    };

    const disconnect = async () => {
        setConnecting(true);
        try {
            await disconnectGmail(workspaceId);
            setConnection(undefined);
            toast.success('Gmail disconnected.');
            onChanged();
        } catch (e) {
            setError(toErrorMessage(e));
        } finally {
            setConnecting(false);
        }
    };

    return (
        <>
            <SectionCard
                title="Google OAuth client"
                description="Ninai talks to Gmail through Google's OAuth flow. Create a Desktop app client in Google Cloud Console, enable the Gmail API and paste the client id here."
            >
                <form
                    onSubmit={event => { event.preventDefault(); saveClientId(); toast.success('Client id saved.'); }}
                    style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
                >
                    <div style={{ flex: '1 1 320px' }}>
                        <Field label="Client id" htmlFor="gmail-client-id" hint="Looks like 1234567890-abc.apps.googleusercontent.com">
                            <TextInput id="gmail-client-id" value={clientId} onChange={event => setClientId(event.target.value)} placeholder="Desktop app client id" />
                        </Field>
                    </div>
                    <Button type="submit" icon="check">Save</Button>
                </form>
                <div className="ws-info-list" style={{ marginTop: 14 }}>
                    <div className="ws-info-row"><Icon name="lock" size={14} /><span className="ws-info-label">Access</span><span className="ws-info-value">Read-only. Ninai can list and read your mail, nothing else.</span></div>
                    <div className="ws-info-row"><Icon name="mail" size={14} /><span className="ws-info-label">Scope</span><span className="ws-info-value">gmail.readonly, openid, email</span></div>
                    <div className="ws-info-row"><Icon name="alert" size={14} /><span className="ws-info-label">Tokens</span><span className="ws-info-value">Stored locally in this browser profile and never leave this device.</span></div>
                </div>
            </SectionCard>

            <SectionCard title="Connection" description="One Gmail account per workspace.">
                {loading ? (
                    <div className="ws-loading"><span className="ws-spinner" /><span>Checking connection…</span></div>
                ) : connection ? (
                    <>
                        <div className="ws-info-list">
                            <div className="ws-info-row"><Icon name="mail" size={14} /><span className="ws-info-label">Account</span><span className="ws-info-value">{connection.email}</span></div>
                            <div className="ws-info-row"><Icon name="clock" size={14} /><span className="ws-info-label">Last sync</span><span className="ws-info-value">{connection.lastSyncedAt ? formatDateTime(connection.lastSyncedAt) : 'Never synced'}</span></div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                            <Button variant="danger" icon="logout" onClick={() => void disconnect()} loading={connecting}>Disconnect</Button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="ws-muted" style={{ marginTop: 0 }}>No Gmail account is connected to this workspace yet.</p>
                        <Button variant="primary" icon="globe" onClick={() => void connect()} loading={connecting}>Connect Gmail</Button>
                    </>
                )}
                {error && <div className="ws-form-error" style={{ marginTop: 12 }}>{error}</div>}
            </SectionCard>
        </>
    );
};

function downloadJson(filename: string, json: string): void {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
