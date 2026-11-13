import React, { useEffect, useState } from 'react';
import type { Priority, Project, ProjectStatus } from '../../db';
import {
    createProject,
    getProjectDetail,
    PROJECT_STATUSES,
    PROJECT_STATUS_LABEL,
    updateProject,
} from '../../services/projects';
import type { WorkspaceUser } from '../../services/workspace';
import { PRIORITIES, PRIORITY_LABEL } from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import { Modal } from '../ui/Modal';
import { Button, Spinner } from '../ui/Misc';
import { Field, MultiUserSelect, Select, TextArea, TextInput, UserSelect } from '../ui/Form';
import { useToast } from '../ui/Toast';

interface ProjectFormProps {
    open: boolean;
    workspaceId: string;
    currentUserId: string;
    members: WorkspaceUser[];
    project?: Project | null;
    onClose: () => void;
    onSaved: (project: Project) => void;
}

interface FormState {
    name: string;
    description: string;
    identifier: string;
    ownerId: string;
    status: ProjectStatus;
    priority: Priority;
    startDate: string;
    endDate: string;
    objectives: string;
    memberIds: string[];
}

export const ProjectForm: React.FC<ProjectFormProps> = ({
    open,
    workspaceId,
    currentUserId,
    members,
    project,
    onClose,
    onSaved,
}) => {
    const toast = useToast();
    const [form, setForm] = useState<FormState>(() => emptyForm(currentUserId));
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setError('');
        setForm(emptyForm(currentUserId, project));
        setLoading(true);

        (async () => {
            if (project) {
                const detail = await getProjectDetail(project.id);
                if (cancelled) return;
                setForm({
                    name: detail.project.name,
                    description: detail.project.description || '',
                    identifier: detail.project.identifier,
                    ownerId: detail.project.ownerId,
                    status: detail.project.status,
                    priority: detail.project.priority,
                    startDate: detail.project.startDate || '',
                    endDate: detail.project.endDate || '',
                    objectives: detail.project.objectives.join('\n'),
                    memberIds: detail.memberIds,
                });
            }
        })()
            .catch(e => { if (!cancelled) setError(toErrorMessage(e)); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [open, project, currentUserId]);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(prev => ({ ...prev, [key]: value }));

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setSaving(true);
        try {
            const input = {
                name: form.name,
                description: form.description,
                identifier: form.identifier,
                ownerId: form.ownerId,
                status: form.status,
                priority: form.priority,
                startDate: form.startDate || undefined,
                endDate: form.endDate || undefined,
                objectives: form.objectives.split('\n'),
                memberIds: form.memberIds,
            };
            const saved = project ? await updateProject(project.id, input) : await createProject(workspaceId, input);
            toast.success(project ? 'Project updated.' : 'Project created.');
            onSaved(saved);
            onClose();
        } catch (e) {
            setError(toErrorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={project ? 'Edit project' : 'New project'}
            subtitle={project ? `Update “${project.name}”` : 'Bring a piece of work back to life with owners, dates and milestones.'}
            size="lg"
            footer={(
                <>
                    <Button onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button variant="primary" type="submit" form="project-form" loading={saving} disabled={loading}>
                        {project ? 'Save changes' : 'Create project'}
                    </Button>
                </>
            )}
        >
            {loading ? <Spinner label="Loading project…" /> : (
                <form id="project-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {error && <div className="ws-form-error"><span>{error}</span></div>}
                    <div className="ws-form-grid">
                        <Field label="Project name" htmlFor="project-name" required className="span-2">
                            <TextInput id="project-name" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Client onboarding revamp" autoFocus />
                        </Field>
                        <Field label="Identifier" htmlFor="project-identifier" hint="Leave blank to generate one.">
                            <TextInput id="project-identifier" value={form.identifier} onChange={e => set('identifier', e.target.value.toUpperCase())} placeholder="NINAI-01" />
                        </Field>
                        <Field label="Owner" htmlFor="project-owner">
                            <UserSelect id="project-owner" users={members} value={form.ownerId} onChange={value => set('ownerId', value)} />
                        </Field>
                        <Field label="Status" htmlFor="project-status">
                            <Select id="project-status" value={form.status} onChange={e => set('status', e.target.value as ProjectStatus)}>
                                {PROJECT_STATUSES.map(status => <option key={status} value={status}>{PROJECT_STATUS_LABEL[status]}</option>)}
                            </Select>
                        </Field>
                        <Field label="Priority" htmlFor="project-priority">
                            <Select id="project-priority" value={form.priority} onChange={e => set('priority', e.target.value as Priority)}>
                                {PRIORITIES.map(priority => <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>)}
                            </Select>
                        </Field>
                        <Field label="Start date" htmlFor="project-start">
                            <TextInput id="project-start" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
                        </Field>
                        <Field label="Target date" htmlFor="project-end">
                            <TextInput id="project-end" type="date" value={form.endDate} min={form.startDate || undefined} onChange={e => set('endDate', e.target.value)} />
                        </Field>
                    </div>
                    <Field label="Description" htmlFor="project-description">
                        <TextArea id="project-description" value={form.description} onChange={e => set('description', e.target.value)} placeholder="What is this project for, and what does success look like?" />
                    </Field>
                    <Field label="Objectives" htmlFor="project-objectives" hint="One objective per line. These appear on the project detail page.">
                        <TextArea id="project-objectives" value={form.objectives} onChange={e => set('objectives', e.target.value)} placeholder={'Ship the onboarding flow\nReduce time-to-value\nClose the pilot client'} />
                    </Field>
                    <Field label="Project team">
                        <MultiUserSelect users={members} value={form.memberIds} onChange={value => set('memberIds', value)} disabledId={form.ownerId} />
                    </Field>
                </form>
            )}
        </Modal>
    );
};

function emptyForm(currentUserId: string, project?: Project | null): FormState {
    return {
        name: project?.name || '',
        description: project?.description || '',
        identifier: project?.identifier || '',
        ownerId: project?.ownerId || currentUserId,
        status: project?.status || 'planning',
        priority: project?.priority || 'medium',
        startDate: project?.startDate || '',
        endDate: project?.endDate || '',
        objectives: project?.objectives.join('\n') || '',
        memberIds: project ? [project.ownerId, currentUserId] : [currentUserId],
    };
}
