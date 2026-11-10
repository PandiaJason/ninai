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
import { listLeadStages } from '../../services/leads';
import { DEFAULT_WORKSPACE_ID, type UserRole } from '../../db';
import { formatDate } from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Badge, Button, ConfirmDialog, IconButton, PageHeader, SectionCard, StatCard } from '../ui/Misc';
import { Icon, type IconName } from '../ui/Icon';
import { Field, Select, TextArea, TextInput } from '../ui/Form';
import { useToast } from '../ui/Toast';
import { useAsyncData } from './useAsyncData';

type SettingsSection = 'profile' | 'workspace' | 'people' | 'pipeline' | 'data';

const SECTIONS: { id: SettingsSection; label: string; icon: IconName }[] = [
    { id: 'profile', label: 'Profile', icon: 'user' },
    { id: 'workspace', label: 'Workspace', icon: 'building' },
    { id: 'people', label: 'People', icon: 'users' },
    { id: 'pipeline', label: 'Pipeline', icon: 'kanban' },
    { id: 'data', label: 'Data', icon: 'file' },
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
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState('#0071e3');
    const [busy, setBusy] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState('#0071e3');

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
            await createStage(workspaceId, { name: newName, color: newColor });
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
        <SectionCard title="CRM pipeline stages" description="Stages are used by every lead in this workspace. The first stage is treated as New; stages flagged as won or lost drive conversion reporting.">
            {loading && <p className="ws-muted">Loading stages…</p>}
            {!loading && stages.map((stage, index) => (
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
                                {stage.isWon === 1 && <Badge tone="green">Won</Badge>}
                                {stage.isLost === 1 && <Badge tone="neutral">Lost</Badge>}
                            </span>
                            {isAdmin && (
                                <div className="ws-user-actions">
                                    <IconButton icon="chevron-up" label="Move earlier" disabled={index === 0} onClick={() => void move(stage.id, -1)} />
                                    <IconButton icon="chevron-down" label="Move later" disabled={index === stages.length - 1} onClick={() => void move(stage.id, 1)} />
                                    <IconButton icon="edit" label="Edit stage" onClick={() => startEdit(stage)} />
                                    <IconButton icon="trash" label="Delete stage" danger disabled={stages.length <= 1} onClick={() => void remove(stage.id)} />
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
                            <TextInput id="new-stage-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Discovery" />
                        </Field>
                    </div>
                    <TextInput type="color" aria-label="Stage colour" value={newColor} onChange={e => setNewColor(e.target.value)} style={{ width: 44, padding: 2 }} />
                    <Button type="submit" icon="plus" loading={busy} disabled={!newName.trim()}>Add stage</Button>
                </form>
            )}
        </SectionCard>
    );
};

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
                <StatCard label="Tasks" value={stats?.tasks ?? 0} icon="tasks" tone="green" />
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
