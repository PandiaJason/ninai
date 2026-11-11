import React, { useEffect, useState } from 'react';
import type { FeedbackTheme, LearnerFeedback, StuckCategory } from '../../db';
import {
    ALGO_TRACK_SUGGESTIONS,
    FEEDBACK_THEMES,
    STUCK_CATEGORIES,
} from '../../services/algo';
import { saveLearnerFeedback, type LearnerFeedbackInput } from '../../services/feedback';
import { toErrorMessage } from '../../services/errors';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Misc';
import { Field, Select, TagInput, TextArea } from '../ui/Form';
import { useToast } from '../ui/Toast';

interface FeedbackFormProps {
    open: boolean;
    leadId: string;
    leadName: string;
    existing?: LearnerFeedback;
    onClose: () => void;
    onSaved: () => void;
}

interface FormState {
    whyStarted: string;
    tracksExplored: string[];
    stuckCategory: StuckCategory;
    whereStuck: string;
    continuedReason: string;
    stoppedReason: string;
    fdeHelpRating: string;
    recommendations: string;
    themes: FeedbackTheme[];
    consentToContact: boolean;
}

export const FeedbackForm: React.FC<FeedbackFormProps> = ({
    open,
    leadId,
    leadName,
    existing,
    onClose,
    onSaved,
}) => {
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState<FormState>(() => emptyForm());

    useEffect(() => {
        if (!open) return;
        setError('');
        setForm(existing ? fromFeedback(existing) : emptyForm());
    }, [open, existing]);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(prev => ({ ...prev, [key]: value }));
    const toggleTheme = (theme: FeedbackTheme) => {
        setForm(prev => ({
            ...prev,
            themes: prev.themes.includes(theme)
                ? prev.themes.filter(item => item !== theme)
                : [...prev.themes, theme],
        }));
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setSaving(true);
        try {
            const input: LearnerFeedbackInput = {
                whyStarted: form.whyStarted,
                tracksExplored: form.tracksExplored,
                stuckCategory: form.stuckCategory,
                whereStuck: form.whereStuck,
                continuedReason: form.continuedReason,
                stoppedReason: form.stoppedReason,
                fdeHelpRating: Number(form.fdeHelpRating),
                recommendations: form.recommendations,
                themes: form.themes,
                consentToContact: form.consentToContact,
            };
            await saveLearnerFeedback(leadId, input);
            toast.success(existing ? 'Feedback updated.' : 'Feedback recorded.');
            onSaved();
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
            title={existing ? 'Edit learner feedback' : 'Record learner feedback'}
            subtitle={`${leadName} · Use their words, not a polished summary.`}
            size="lg"
            footer={(
                <>
                    <Button onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button variant="primary" type="submit" form="feedback-form" loading={saving}>
                        {existing ? 'Save feedback' : 'Save feedback'}
                    </Button>
                </>
            )}
        >
            <form id="feedback-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {error && <div className="ws-form-error"><span>{error}</span></div>}

                <div className="ws-form-section">
                    <div className="ws-form-section-title">The learner's experience</div>
                    <Field label="Why did they start?" htmlFor="feed-why" required>
                        <TextArea id="feed-why" value={form.whyStarted} onChange={e => set('whyStarted', e.target.value)} placeholder="What were they trying to get better at? Why ALGO, why now?" rows={3} />
                    </Field>
                    <Field label="Tracks explored" htmlFor="feed-tracks">
                        <TagInput value={form.tracksExplored} onChange={tracks => set('tracksExplored', tracks)} suggestions={ALGO_TRACK_SUGGESTIONS} />
                    </Field>
                </div>

                <div className="ws-form-section">
                    <div className="ws-form-section-title">Where they got stuck</div>
                    <div className="ws-form-grid">
                        <Field label="Stuck category" htmlFor="feed-stuck-category" required>
                            <Select id="feed-stuck-category" value={form.stuckCategory} onChange={e => set('stuckCategory', e.target.value as StuckCategory)}>
                                {STUCK_CATEGORIES.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
                            </Select>
                        </Field>
                        <Field label="Did ALGO help FDE preparation?" htmlFor="feed-rating" required>
                            <Select id="feed-rating" value={form.fdeHelpRating} onChange={e => set('fdeHelpRating', e.target.value)}>
                                <option value="1">1 — Not at all</option>
                                <option value="2">2 — A little</option>
                                <option value="3">3 — Somewhat</option>
                                <option value="4">4 — Quite a lot</option>
                                <option value="5">5 — Directly useful</option>
                            </Select>
                        </Field>
                    </div>
                    <Field label="Where exactly did they get stuck?" htmlFor="feed-where" required>
                        <TextArea id="feed-where" value={form.whereStuck} onChange={e => set('whereStuck', e.target.value)} placeholder="The specific challenge, concept or moment. Quote them if possible." rows={3} />
                    </Field>
                    <div className="ws-form-grid">
                        <Field label="Why did they continue?" htmlFor="feed-continued">
                            <TextArea id="feed-continued" value={form.continuedReason} onChange={e => set('continuedReason', e.target.value)} placeholder="What kept them going?" rows={2} />
                        </Field>
                        <Field label="Why did they stop or pause?" htmlFor="feed-stopped">
                            <TextArea id="feed-stopped" value={form.stoppedReason} onChange={e => set('stoppedReason', e.target.value)} placeholder="Time, difficulty, value, motivation, a bug…" rows={2} />
                        </Field>
                    </div>
                </div>

                <div className="ws-form-section">
                    <div className="ws-form-section-title">What should change</div>
                    <Field label="Recurring themes" htmlFor="feed-themes" hint="Choose the themes this feedback supports. Leave blank if none.">
                        <div className="ws-check-grid" id="feed-themes">
                            {FEEDBACK_THEMES.map(theme => (
                                <label key={theme.id} className={`ws-check-row ${form.themes.includes(theme.id) ? 'checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={form.themes.includes(theme.id)}
                                        onChange={() => toggleTheme(theme.id)}
                                    />
                                    <span className="ws-check-name">{theme.label}</span>
                                </label>
                            ))}
                        </div>
                    </Field>
                    <Field label="What would make ALGO more useful?" htmlFor="feed-recommendations">
                        <TextArea id="feed-recommendations" value={form.recommendations} onChange={e => set('recommendations', e.target.value)} placeholder="One concrete change they would make." rows={2} />
                    </Field>
                    <label className="ws-check-row" style={{ marginTop: 4 }}>
                        <input type="checkbox" checked={form.consentToContact} onChange={e => set('consentToContact', e.target.checked)} />
                        <span className="ws-check-name">They are open to a follow-up conversation.</span>
                    </label>
                </div>
            </form>
        </Modal>
    );
};

function emptyForm(): FormState {
    return {
        whyStarted: '',
        tracksExplored: [],
        stuckCategory: 'difficulty',
        whereStuck: '',
        continuedReason: '',
        stoppedReason: '',
        fdeHelpRating: '3',
        recommendations: '',
        themes: [],
        consentToContact: false,
    };
}

function fromFeedback(feedback: LearnerFeedback): FormState {
    return {
        whyStarted: feedback.whyStarted,
        tracksExplored: feedback.tracksExplored || [],
        stuckCategory: feedback.stuckCategory,
        whereStuck: feedback.whereStuck,
        continuedReason: feedback.continuedReason || '',
        stoppedReason: feedback.stoppedReason || '',
        fdeHelpRating: String(feedback.fdeHelpRating || 3),
        recommendations: feedback.recommendations || '',
        themes: feedback.themes || [],
        consentToContact: feedback.consentToContact === 1,
    };
}
