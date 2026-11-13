import React, { useEffect, useState } from 'react';
import type { Lead, Priority, Project, Task, TaskStatus } from '../../db';
import { createTask, updateTask, TASK_STATUSES, TASK_STATUS_LABEL } from '../../services/tasks';
import { listLeads } from '../../services/leads';
import { listProjects } from '../../services/projects';
import { getTagsForEntity, getTagSuggestions } from '../../services/tags';
import type { WorkspaceUser } from '../../services/workspace';
import { PRIORITIES, PRIORITY_LABEL } from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import { Modal } from '../ui/Modal';
import { Button, Spinner } from '../ui/Misc';
import { Field, Select, TagInput, TextArea, TextInput, UserSelect } from '../ui/Form';
import { useToast } from '../ui/Toast';

interface TaskFormProps {
    open: boolean;
    workspaceId: string;
    currentUserId: string;
    members: WorkspaceUser[];
    task?: Task | null;
    initialLeadId?: string;
    initialProjectId?: string;
    initialStatus?: TaskStatus;
    onClose: () => void;
    onSaved: (task: Task) => void;
}

interface FormState {
    title: string;
    description: string;
    leadId: string;
    projectId: string;
    assigneeId: string;
    priority: Priority;
    status: TaskStatus;
    startDate: string;
    dueDate: string;
    tags: string[];
}

export const TaskForm: React.FC<TaskFormProps> = ({
    open,
    workspaceId,
    currentUserId,
    members,
    task,
    initialLeadId,
    initialProjectId,
    initialStatus,
    onClose,
    onSaved,
}) => {
    const toast = useToast();
    const [form, setForm] = useState<FormState>(() => emptyForm(currentUserId, initialLeadId, initialProjectId, initialStatus));
    const [leads, setLeads] = useState<Lead[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setError('');
        setForm(emptyForm(currentUserId, initialLeadId, initialProjectId, initialStatus));
        setLoading(true);

        (async () => {
            const [workspaceLeads, workspaceProjects, tagSuggestions] = await Promise.all([
                listLeads(workspaceId),
                listProjects(workspaceId),
                getTagSuggestions(workspaceId),
            ]);
            if (cancelled) return;
            setLeads(workspaceLeads);
            setProjects(workspaceProjects);
            setSuggestions(tagSuggestions);

            if (task) {
                const tags = await getTagsForEntity('task', task.id);
                if (cancelled) return;
                setForm({
                    title: task.title,
                    description: task.description || '',
                    leadId: task.leadId || '',
                    projectId: task.projectId || '',
                    assigneeId: task.assigneeId || '',
                    priority: task.priority,
                    status: task.status,
                    startDate: task.startDate || '',
                    dueDate: task.dueDate || '',
                    tags: tags.map(tag => tag.name),
                });
            }
        })()
            .catch(e => { if (!cancelled) setError(toErrorMessage(e)); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [open, task, workspaceId, currentUserId, initialLeadId, initialProjectId, initialStatus]);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(prev => ({ ...prev, [key]: value }));

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setSaving(true);
        try {
            const input = {
                title: form.title,
                description: form.description,
                leadId: form.leadId || null,
                projectId: form.projectId || null,
                assigneeId: form.assigneeId || null,
                priority: form.priority,
                status: form.status,
                startDate: form.startDate || undefined,
                dueDate: form.dueDate || undefined,
                tags: form.tags,
            };
            const saved = task ? await updateTask(task.id, input) : await createTask(workspaceId, input);
            toast.success(task ? 'Task updated.' : 'Task created.');
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
            title={task ? 'Edit task' : 'New task'}
            subtitle={task ? `Update “${task.title}”` : 'Assign work, link it to a lead, and set a deadline.'}
            size="lg"
            footer={(
                <>
                    <Button onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button variant="primary" type="submit" form="task-form" loading={saving} disabled={loading}>
                        {task ? 'Save changes' : 'Create task'}
                    </Button>
                </>
            )}
        >
            {loading ? <Spinner label="Loading task…" /> : (
                <form id="task-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {error && <div className="ws-form-error"><span>{error}</span></div>}

                    <Field label="Task title" htmlFor="task-title" required>
                        <TextInput id="task-title" value={form.title} onChange={e => set('title', e.target.value)} placeholder="What needs to be done?" autoFocus />
                    </Field>

                    <Field label="Description" htmlFor="task-description">
                        <TextArea id="task-description" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Add context, acceptance criteria or links." />
                    </Field>

                    <div className="ws-form-grid">
                        <Field label="Related lead" htmlFor="task-lead">
                            <Select id="task-lead" value={form.leadId} onChange={e => set('leadId', e.target.value)}>
                                <option value="">No lead</option>
                                {leads.map(lead => <option key={lead.id} value={lead.id}>{lead.name}{lead.company ? ` · ${lead.company}` : ''}</option>)}
                            </Select>
                        </Field>
                        <Field label="Project" htmlFor="task-project">
                            <Select id="task-project" value={form.projectId} onChange={e => set('projectId', e.target.value)}>
                                <option value="">No project</option>
                                {projects.map(project => <option key={project.id} value={project.id}>{project.name} · {project.identifier}</option>)}
                            </Select>
                        </Field>
                        <Field label="Assignee" htmlFor="task-assignee">
                            <UserSelect
                                id="task-assignee"
                                users={members}
                                value={form.assigneeId}
                                onChange={value => set('assigneeId', value)}
                                allowUnassigned
                            />
                        </Field>
                        <Field label="Priority" htmlFor="task-priority">
                            <Select id="task-priority" value={form.priority} onChange={e => set('priority', e.target.value as Priority)}>
                                {PRIORITIES.map(priority => <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>)}
                            </Select>
                        </Field>
                        <Field label="Status" htmlFor="task-status">
                            <Select id="task-status" value={form.status} onChange={e => set('status', e.target.value as TaskStatus)}>
                                {TASK_STATUSES.map(status => <option key={status} value={status}>{TASK_STATUS_LABEL[status]}</option>)}
                            </Select>
                        </Field>
                        <Field label="Tags" htmlFor="task-tags">
                            <TagInput value={form.tags} onChange={tags => set('tags', tags)} suggestions={suggestions} />
                        </Field>
                        <Field label="Start date" htmlFor="task-start">
                            <TextInput id="task-start" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
                        </Field>
                        <Field label="Due date" htmlFor="task-due">
                            <TextInput id="task-due" type="date" value={form.dueDate} min={form.startDate || undefined} onChange={e => set('dueDate', e.target.value)} />
                        </Field>
                    </div>
                </form>
            )}
        </Modal>
    );
};

function emptyForm(
    currentUserId: string,
    initialLeadId?: string,
    initialProjectId?: string,
    initialStatus?: TaskStatus,
): FormState {
    return {
        title: '',
        description: '',
        leadId: initialLeadId || '',
        projectId: initialProjectId || '',
        assigneeId: currentUserId,
        priority: 'medium',
        status: initialStatus || 'todo',
        startDate: '',
        dueDate: '',
        tags: [],
    };
}
