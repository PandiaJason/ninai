import React, { useEffect, useState } from 'react';
import type { FeedbackStatus, Lead, LeadAudience, LeadQuality, LeadStage, LearnerPersona, Priority } from '../../db';
import { createLead, updateLead } from '../../services/leads';
import {
    ALGO_TRACK_SUGGESTIONS,
    FEEDBACK_STATUS_LABEL,
    INSTITUTION_TYPES,
    LEAD_QUALITIES,
    LEAD_SOURCES,
    LEARNER_PERSONAS,
    normalizeSource,
    sourceLabel,
    stagesForAudience,
} from '../../services/algo';
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
    defaultAudience?: LeadAudience;
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
    sourceDetail: string;
    industry: string;
    location: string;
    ownerId: string;
    stageId: string;
    priority: Priority;
    value: string;
    description: string;
    tags: string[];
    nextFollowUpAt: string;
    audience: LeadAudience;
    persona: LearnerPersona | '';
    quality: LeadQuality | '';
    firstChallengeAt: string;
    challengeAttempts: string;
    tracksExplored: string[];
    lastActiveAt: string;
    feedbackStatus: FeedbackStatus;
    dropOffReason: string;
    institutionType: string;
    studentCount: string;
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
    defaultAudience = 'learner',
    onClose,
    onSaved,
}) => {
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState<FormState>(() => emptyForm(currentUserId, stages, defaultAudience));

    useEffect(() => {
        if (!open) return;
        setError('');
        setForm(lead ? fromLead(lead, leadTags || []) : emptyForm(currentUserId, stages, defaultAudience));
    }, [open, lead, leadTags, currentUserId, stages, defaultAudience]);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(prev => ({ ...prev, [key]: value }));
    const audienceStages = stagesForAudience(stages, form.audience);
    const isLearner = form.audience === 'learner';

    const changeAudience = (audience: LeadAudience) => {
        const nextStages = stagesForAudience(stages, audience);
        setForm(prev => ({
            ...prev,
            audience,
            stageId: nextStages[0]?.id || '',
            persona: audience === 'institution' ? '' : prev.persona,
            feedbackStatus: audience === 'institution' ? 'not_requested' : prev.feedbackStatus,
        }));
    };

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
                sourceDetail: form.sourceDetail,
                industry: form.industry,
                location: form.location,
                ownerId: form.ownerId || currentUserId,
                stageId: form.stageId || audienceStages[0]?.id,
                priority: form.priority,
                value: Number(form.value || 0),
                description: form.description,
                tags: form.tags,
                nextFollowUpAt: form.nextFollowUpAt ? fromDatetimeLocal(form.nextFollowUpAt) : null,
                audience: form.audience,
                persona: form.persona || undefined,
                quality: form.quality || undefined,
                firstChallengeAt: form.firstChallengeAt ? fromDatetimeLocal(form.firstChallengeAt) : null,
                challengeAttempts: Number(form.challengeAttempts || 0),
                tracksExplored: form.tracksExplored,
                lastActiveAt: form.lastActiveAt ? fromDatetimeLocal(form.lastActiveAt) : null,
                feedbackStatus: form.feedbackStatus,
                dropOffReason: form.dropOffReason,
                institutionType: form.institutionType,
                studentCount: form.studentCount ? Number(form.studentCount) : null,
            };
            const saved = lead ? await updateLead(lead.id, input) : await createLead(workspaceId, input);
            toast.success(lead ? 'Lead updated.' : form.audience === 'learner' ? 'Learner added.' : 'Institution added.');
            onSaved(saved);
            onClose();
        } catch (e) {
            setError(toErrorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    const title = lead ? 'Edit record' : isLearner ? 'New learner' : 'New institution';
    const subtitle = lead
        ? `Update ${lead.name}`
        : isLearner
            ? 'Capture where they came from, why they are here and what happened next.'
            : 'Track a college or training partner through discovery and pilots. No offer is promised yet.';

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            size="lg"
            footer={(
                <>
                    <Button onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button variant="primary" type="submit" form="lead-form" loading={saving}>{lead ? 'Save changes' : 'Create record'}</Button>
                </>
            )}
        >
            <form id="lead-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {error && <div className="ws-form-error"><span>{error}</span></div>}

                <div className="ws-form-section">
                    <div className="ws-form-section-title">Who is this?</div>
                    <div className="ws-form-grid">
                        <Field label="Pipeline" htmlFor="lead-audience">
                            <Select id="lead-audience" value={form.audience} onChange={e => changeAudience(e.target.value as LeadAudience)}>
                                <option value="learner">Learner</option>
                                <option value="institution">Institution</option>
                            </Select>
                        </Field>
                        <Field label={isLearner ? 'Learner name' : 'Primary contact'} htmlFor="lead-name" required>
                            <TextInput id="lead-name" value={form.name} onChange={e => set('name', e.target.value)} placeholder={isLearner ? 'e.g. Priya Raman' : 'e.g. Dr. Meera Krishnan'} autoFocus />
                        </Field>
                        <Field label={isLearner ? 'College / company' : 'Institution name'} htmlFor="lead-company">
                            <TextInput id="lead-company" value={form.company} onChange={e => set('company', e.target.value)} placeholder={isLearner ? 'College or employer' : 'College, university or institute'} />
                        </Field>
                        <Field label={isLearner ? 'Email' : 'Contact email'} htmlFor="lead-email">
                            <TextInput id="lead-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@example.com" />
                        </Field>
                        <Field label="Phone" htmlFor="lead-phone">
                            <TextInput id="lead-phone" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 00000 00000" />
                        </Field>
                        <Field label="Website" htmlFor="lead-website">
                            <TextInput id="lead-website" value={form.website} onChange={e => set('website', e.target.value)} placeholder="college.edu" />
                        </Field>
                        <Field label={isLearner ? 'Current role / year' : 'Role'} htmlFor="lead-title">
                            <TextInput id="lead-title" value={form.jobTitle} onChange={e => set('jobTitle', e.target.value)} placeholder={isLearner ? 'Final year, CSE' : 'Placement head, Dean…'} />
                        </Field>
                        <Field label="Location" htmlFor="lead-location">
                            <TextInput id="lead-location" value={form.location} onChange={e => set('location', e.target.value)} placeholder="City, state" />
                        </Field>
                    </div>
                </div>

                <div className="ws-form-section">
                    <div className="ws-form-section-title">ALGO profile</div>
                    <div className="ws-form-grid">
                        <Field label="Source" htmlFor="lead-source">
                            <Select id="lead-source" value={form.source} onChange={e => set('source', e.target.value)}>
                                <option value="">Choose a source</option>
                                {form.source && !LEAD_SOURCES.some(source => source.id === form.source) && (
                                    <option value={form.source}>{sourceLabel(form.source)}</option>
                                )}
                                {LEAD_SOURCES.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}
                            </Select>
                        </Field>
                        <Field label="Source detail" htmlFor="lead-source-detail" hint="Post, community, referral name or campaign.">
                            <TextInput id="lead-source-detail" value={form.sourceDetail} onChange={e => set('sourceDetail', e.target.value)} placeholder="e.g. LinkedIn FDE post, March cohort" />
                        </Field>
                        {isLearner ? (
                            <Field label="Persona" htmlFor="lead-persona">
                                <Select id="lead-persona" value={form.persona} onChange={e => set('persona', e.target.value as LearnerPersona | '')}>
                                    <option value="">Not set</option>
                                    {LEARNER_PERSONAS.map(persona => <option key={persona.id} value={persona.id}>{persona.label}</option>)}
                                </Select>
                            </Field>
                        ) : (
                            <>
                                <Field label="Institution type" htmlFor="lead-institution-type">
                                    <Select id="lead-institution-type" value={form.institutionType} onChange={e => set('institutionType', e.target.value)}>
                                        <option value="">Not set</option>
                                        {INSTITUTION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                                    </Select>
                                </Field>
                                <Field label="Students reached" htmlFor="lead-student-count" hint="Approximate is enough.">
                                    <TextInput id="lead-student-count" type="number" min={0} step={1} value={form.studentCount} onChange={e => set('studentCount', e.target.value)} placeholder="e.g. 240" />
                                </Field>
                            </>
                        )}
                        <Field label="Lead quality" htmlFor="lead-quality" hint="Quality is separate from stage.">
                            <Select id="lead-quality" value={form.quality} onChange={e => set('quality', e.target.value as LeadQuality | '')}>
                                <option value="">Not assessed</option>
                                {LEAD_QUALITIES.map(quality => <option key={quality.id} value={quality.id}>{quality.label}</option>)}
                            </Select>
                        </Field>
                    </div>
                    {form.quality && (
                        <p className="ws-form-hint">{LEAD_QUALITIES.find(quality => quality.id === form.quality)?.hint}</p>
                    )}
                </div>

                <div className="ws-form-section">
                    <div className="ws-form-section-title">Pipeline</div>
                    <div className="ws-form-grid">
                        <Field label="Stage" htmlFor="lead-stage">
                            <Select id="lead-stage" value={form.stageId} onChange={e => set('stageId', e.target.value)}>
                                {audienceStages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
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
                        <Field label="Next follow-up" htmlFor="lead-followup">
                            <TextInput id="lead-followup" type="datetime-local" value={form.nextFollowUpAt} onChange={e => set('nextFollowUpAt', e.target.value)} />
                        </Field>
                        {!isLearner && (
                            <Field label="Potential value (USD)" htmlFor="lead-value" hint="Optional. There is no confirmed institution offer yet.">
                                <TextInput id="lead-value" type="number" min={0} step={1} value={form.value} onChange={e => set('value', e.target.value)} placeholder="0" />
                            </Field>
                        )}
                    </div>
                </div>

                {isLearner && (
                    <div className="ws-form-section">
                        <div className="ws-form-section-title">Activation</div>
                        <div className="ws-form-grid">
                            <Field label="Challenge attempts" htmlFor="lead-attempts" hint="Attempted, not completed.">
                                <TextInput id="lead-attempts" type="number" min={0} step={1} value={form.challengeAttempts} onChange={e => set('challengeAttempts', e.target.value)} placeholder="0" />
                            </Field>
                            <Field label="First challenge" htmlFor="lead-first-challenge">
                                <TextInput id="lead-first-challenge" type="datetime-local" value={form.firstChallengeAt} onChange={e => set('firstChallengeAt', e.target.value)} />
                            </Field>
                            <Field label="Last active" htmlFor="lead-last-active">
                                <TextInput id="lead-last-active" type="datetime-local" value={form.lastActiveAt} onChange={e => set('lastActiveAt', e.target.value)} />
                            </Field>
                            <Field label="Feedback status" htmlFor="lead-feedback-status">
                                <Select id="lead-feedback-status" value={form.feedbackStatus} onChange={e => set('feedbackStatus', e.target.value as FeedbackStatus)}>
                                    {(['not_requested', 'requested', 'submitted'] as FeedbackStatus[]).map(status => (
                                        <option key={status} value={status}>{FEEDBACK_STATUS_LABEL[status]}</option>
                                    ))}
                                </Select>
                            </Field>
                        </div>
                        <Field label="Tracks explored" htmlFor="lead-tracks">
                            <TagInput value={form.tracksExplored} onChange={tracks => set('tracksExplored', tracks)} suggestions={ALGO_TRACK_SUGGESTIONS} />
                        </Field>
                        <Field label="Drop-off / pause reason" htmlFor="lead-dropoff" hint="Why did they stop or go quiet? Use their words where possible.">
                            <TextArea id="lead-dropoff" value={form.dropOffReason} onChange={e => set('dropOffReason', e.target.value)} placeholder="e.g. Got stuck on the first systems challenge; placement exams took over." rows={2} />
                        </Field>
                    </div>
                )}

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

function emptyForm(currentUserId: string, stages: LeadStage[], audience: LeadAudience): FormState {
    const audienceStages = stagesForAudience(stages, audience);
    return {
        name: '',
        company: '',
        email: '',
        phone: '',
        website: '',
        jobTitle: '',
        source: '',
        sourceDetail: '',
        industry: '',
        location: '',
        ownerId: currentUserId,
        stageId: audienceStages[0]?.id || '',
        priority: 'medium',
        value: '',
        description: '',
        tags: [],
        nextFollowUpAt: '',
        audience,
        persona: '',
        quality: '',
        firstChallengeAt: '',
        challengeAttempts: '0',
        tracksExplored: [],
        lastActiveAt: '',
        feedbackStatus: 'not_requested',
        dropOffReason: '',
        institutionType: '',
        studentCount: '',
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
        source: normalizeSource(lead.source) || '',
        sourceDetail: lead.sourceDetail || '',
        industry: lead.industry || '',
        location: lead.location || '',
        ownerId: lead.ownerId,
        stageId: lead.stageId,
        priority: lead.priority,
        value: String(lead.value || ''),
        description: lead.description || '',
        tags,
        nextFollowUpAt: lead.nextFollowUpAt ? toDatetimeLocal(lead.nextFollowUpAt) : '',
        audience: lead.audience === 'institution' ? 'institution' : 'learner',
        persona: lead.persona || '',
        quality: lead.quality || '',
        firstChallengeAt: lead.firstChallengeAt ? toDatetimeLocal(lead.firstChallengeAt) : '',
        challengeAttempts: String(lead.challengeAttempts || 0),
        tracksExplored: lead.tracksExplored || [],
        lastActiveAt: lead.lastActiveAt ? toDatetimeLocal(lead.lastActiveAt) : '',
        feedbackStatus: lead.feedbackStatus || 'not_requested',
        dropOffReason: lead.dropOffReason || '',
        institutionType: lead.institutionType || '',
        studentCount: lead.studentCount !== undefined ? String(lead.studentCount) : '',
    };
}
