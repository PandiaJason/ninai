import React, { useEffect, useState } from 'react';
import type { Lead, LeadStage, Priority } from '../../db';
import { createLead, updateLead } from '../../services/leads';
import type { WorkspaceUser } from '../../services/workspace';
import { PRIORITIES, PRIORITY_LABEL, fromDatetimeLocal, toDatetimeLocal } from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Misc';
import { Field, Select, TagInput, TextArea, TextInput } from '../ui/Form';
import { useToast } from '../ui/Toast';

interface LeadFormProps {
    open: boolean;
    workspaceId: string;
    currentUserId: string;
    members: WorkspaceUser[];
    stages: LeadStage[];
    lead?: Lead | null;
    leadTags?: string[];
    tagSuggestions: string[];
    onClose: () => void;
    onSaved: (lead: Lead) => void;
}

interface FormState {
    name: string;
    company: string;
    email: string;
    phone: string;
    website: string;
    jobTitle: string;
    source: string;
    industry: string;
    location: string;
    ownerId: string;
    stageId: string;
    priority: Priority;
    value: string;
    description: string;
    tags: string[];
    nextFollowUpAt: string;
}

export const LeadForm: React.FC<LeadFormProps> = ({
    open,
    workspaceId,
    currentUserId,
    members,
    stages,
    lead,
    leadTags,
    tagSuggestions,
    onClose,
    onSaved,
}) => {
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState<FormState>(() => emptyForm(currentUserId, stages));

    useEffect(() => {
        if (!open) return;
        setError('');
        setForm(lead ? fromLead(lead, leadTags || []) : emptyForm(currentUserId, stages));
    }, [open, lead, leadTags, currentUserId, stages]);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(prev => ({ ...prev, [key]: value }));

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setSaving(true);
        try {
            const input = {
                name: form.name,
                company: form.company,
                email: form.email,
                phone: form.phone,
                website: form.website,
                jobTitle: form.jobTitle,
                source: form.source,
                industry: form.industry,
                location: form.location,
                ownerId: form.ownerId || currentUserId,
                stageId: form.stageId || stages[0]?.id,
                priority: form.priority,
                value: Number(form.value || 0),
                description: form.description,
                tags: form.tags,
                nextFollowUpAt: form.nextFollowUpAt ? fromDatetimeLocal(form.nextFollowUpAt) : null,
            };
            const saved = lead ? await updateLead(lead.id, input) : await createLead(workspaceId, input);
            toast.success(lead ? 'Lead updated.' : 'Lead created.');
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
            title={lead ? 'Edit lead' : 'New lead'}
            subtitle={lead ? `Update ${lead.name}` : 'Add an opportunity to your pipeline.'}
            size="lg"
            footer={(
                <>
                    <Button onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button variant="primary" type="submit" form="lead-form" loading={saving}>{lead ? 'Save changes' : 'Create lead'}</Button>
                </>
            )}
        >
            <form id="lead-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {error && <div className="ws-form-error"><span>{error}</span></div>}

                <div className="ws-form-grid">
                    <Field label="Lead name" htmlFor="lead-name" required>
                        <TextInput id="lead-name" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Priya Raman" autoFocus />
                    </Field>
                    <Field label="Company" htmlFor="lead-company">
                        <TextInput id="lead-company" value={form.company} onChange={e => set('company', e.target.value)} placeholder="Company name" />
                    </Field>
                    <Field label="Email" htmlFor="lead-email">
                        <TextInput id="lead-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@company.com" />
                    </Field>
                    <Field label="Phone" htmlFor="lead-phone">
                        <TextInput id="lead-phone" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 555 000 0000" />
                    </Field>
                    <Field label="Website" htmlFor="lead-website">
                        <TextInput id="lead-website" value={form.website} onChange={e => set('website', e.target.value)} placeholder="company.com" />
                    </Field>
                    <Field label="Job title" htmlFor="lead-title">
                        <TextInput id="lead-title" value={form.jobTitle} onChange={e => set('jobTitle', e.target.value)} placeholder="Decision maker" />
                    </Field>
                </div>

                <div className="ws-form-section">
                    <div className="ws-form-section-title">Pipeline</div>
                    <div className="ws-form-grid">
                        <Field label="Stage" htmlFor="lead-stage">
                            <Select id="lead-stage" value={form.stageId} onChange={e => set('stageId', e.target.value)}>
                                {stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                            </Select>
                        </Field>
                        <Field label="Owner" htmlFor="lead-owner">
                            <Select id="lead-owner" value={form.ownerId} onChange={e => set('ownerId', e.target.value)}>
                                {members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                            </Select>
                        </Field>
                        <Field label="Priority" htmlFor="lead-priority">
                            <Select id="lead-priority" value={form.priority} onChange={e => set('priority', e.target.value as Priority)}>
                                {PRIORITIES.map(priority => <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>)}
                            </Select>
                        </Field>
                        <Field label="Potential value (USD)" htmlFor="lead-value">
                            <TextInput id="lead-value" type="number" min={0} step={1} value={form.value} onChange={e => set('value', e.target.value)} placeholder="0" />
                        </Field>
                        <Field label="Source" htmlFor="lead-source">
                            <TextInput id="lead-source" value={form.source} onChange={e => set('source', e.target.value)} placeholder="Referral, website, event…" />
                        </Field>
                        <Field label="Next follow-up" htmlFor="lead-followup">
                            <TextInput id="lead-followup" type="datetime-local" value={form.nextFollowUpAt} onChange={e => set('nextFollowUpAt', e.target.value)} />
                        </Field>
                        <Field label="Industry" htmlFor="lead-industry">
                            <TextInput id="lead-industry" value={form.industry} onChange={e => set('industry', e.target.value)} placeholder="Industry" />
                        </Field>
                        <Field label="Location" htmlFor="lead-location">
                            <TextInput id="lead-location" value={form.location} onChange={e => set('location', e.target.value)} placeholder="City, country" />
                        </Field>
                    </div>
                </div>

                <Field label="Tags" htmlFor="lead-tags">
                    <TagInput value={form.tags} onChange={tags => set('tags', tags)} suggestions={tagSuggestions} />
                </Field>

                <Field label="Description" htmlFor="lead-description">
                    <TextArea id="lead-description" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Context, requirements, next steps…" />
                </Field>
            </form>
        </Modal>
    );
};

function emptyForm(currentUserId: string, stages: LeadStage[]): FormState {
    return {
        name: '',
        company: '',
        email: '',
        phone: '',
        website: '',
        jobTitle: '',
        source: '',
        industry: '',
        location: '',
        ownerId: currentUserId,
        stageId: stages[0]?.id || '',
        priority: 'medium',
        value: '',
        description: '',
        tags: [],
        nextFollowUpAt: '',
    };
}

function fromLead(lead: Lead, tags: string[]): FormState {
    return {
        name: lead.name,
        company: lead.company || '',
        email: lead.email || '',
        phone: lead.phone || '',
        website: lead.website || '',
        jobTitle: lead.jobTitle || '',
        source: lead.source || '',
        industry: lead.industry || '',
        location: lead.location || '',
        ownerId: lead.ownerId,
        stageId: lead.stageId,
        priority: lead.priority,
        value: String(lead.value || ''),
        description: lead.description || '',
        tags,
        nextFollowUpAt: lead.nextFollowUpAt ? toDatetimeLocal(lead.nextFollowUpAt) : '',
    };
}
