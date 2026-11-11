import React, { useState } from 'react';
import type { WorkspaceNav } from '../../types/workspace';
import { getTodayData, type TodayItem } from '../../services/today';
import { requestLearnerFeedback } from '../../services/leads';
import { toErrorMessage } from '../../services/errors';
import { Button, EmptyState, SectionCard } from '../ui/Misc';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { DataState } from './shared';
import { useAsyncData } from './useAsyncData';
import { FeedbackForm } from './FeedbackForm';

interface TodayViewProps {
    workspaceId: string;
    userId: string;
    userName: string;
    nav: WorkspaceNav;
}

interface FeedbackTarget {
    id: string;
    name: string;
}

export const TodayView: React.FC<TodayViewProps> = ({ workspaceId, userId, userName, nav }) => {
    const toast = useToast();
    const { data, loading, error, reload } = useAsyncData(
        () => getTodayData(workspaceId, userId),
        [workspaceId, userId],
    );
    const [busyId, setBusyId] = useState<string | null>(null);
    const [feedbackTarget, setFeedbackTarget] = useState<FeedbackTarget | null>(null);

    const firstName = userName.split(/\s+/)[0] || userName;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const dateLabel = new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(new Date());

    const run = async (item: TodayItem) => {
        const action = item.action;
        if (action.type === 'record_feedback') {
            setFeedbackTarget({ id: action.leadId, name: action.leadName });
            return;
        }
        if (action.type === 'request_feedback') {
            setBusyId(item.id);
            try {
                await requestLearnerFeedback(action.leadId);
                toast.success(`Feedback requested from ${action.leadName}.`);
                await reload();
            } catch (e) {
                toast.error(toErrorMessage(e));
            } finally {
                setBusyId(null);
            }
            return;
        }
        if (action.type === 'open_lead') nav.openLead(action.leadId);
        else if (action.type === 'open_project') nav.openProject(action.projectId);
        else if (action.type === 'open_task') nav.openTask(action.taskId);
        else nav.openNote(action.noteId);
    };

    const sections = data ? [
        {
            key: 'followup',
            title: 'Follow-ups due',
            description: 'Assigned to you and due today or earlier.',
            items: data.followUps,
        },
        {
            key: 'feedback_requested',
            title: 'Feedback requested',
            description: 'The learner has been asked. Record the answers when they reply.',
            items: data.feedbackRequested,
        },
        {
            key: 'activation',
            title: 'Activated, no feedback yet',
            description: 'They have attempted a challenge. Close the loop before they drift.',
            items: data.activation,
        },
        {
            key: 'stalled',
            title: 'Quiet for 14+ days',
            description: 'No contact or practice in over two weeks.',
            items: data.stalled,
        },
    ].filter(section => section.items.length > 0) : [];

    const total = data?.items.length || 0;

    return (
        <div className="ws-module ws-today">
            <div className="ws-module-inner ws-today-inner">
                <header className="ws-today-head">
                    <div className="ws-eyebrow">Today</div>
                    <h1>{greeting}, {firstName}</h1>
                    <p>
                        {dateLabel}
                        {data ? ` · ${total === 0 ? 'nothing needs you right now' : `${total} thing${total === 1 ? '' : 's'} need a next step`}` : ''}
                    </p>
                </header>

                <DataState loading={loading} error={error} onRetry={() => void reload()} />

                {data && total === 0 && (
                    <EmptyState
                        icon="circle-check"
                        title="You’re clear for today"
                        description="No follow-ups are due and no learner is waiting on feedback. Add a learner from Learners when you are ready."
                    />
                )}

                {data && total > 0 && (
                    <div className="ws-today-sections">
                        {sections.map(section => (
                            <SectionCard
                                key={section.key}
                                title={section.title}
                                description={section.description}
                            >
                                <div className="ws-today-list">
                                    {section.items.map(item => (
                                        <div key={item.id} className="ws-today-row">
                                            <div className="ws-today-row-main">
                                                <div className="ws-today-row-title">{item.title}</div>
                                                <div className="ws-today-row-subtitle">{item.subtitle}</div>
                                            </div>
                                            <div className="ws-today-row-meta">
                                                <span>{item.meta}</span>
                                                <Button
                                                    variant={item.kind === 'feedback_requested' || item.kind === 'activation' ? 'primary' : 'secondary'}
                                                    onClick={() => void run(item)}
                                                    loading={busyId === item.id}
                                                    aria-label={`${item.actionLabel}: ${item.title}`}
                                                >
                                                    {item.actionLabel}
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        ))}
                    </div>
                )}

                {data && total === 0 && (
                    <div className="ws-today-clear-note">
                        <Icon name="circle-check" size={16} />
                        <span>Today is a good day to improve one thing in the product.</span>
                    </div>
                )}
            </div>

            {feedbackTarget && (
                <FeedbackForm
                    open
                    leadId={feedbackTarget.id}
                    leadName={feedbackTarget.name}
                    onClose={() => setFeedbackTarget(null)}
                    onSaved={() => {
                        setFeedbackTarget(null);
                        void reload();
                    }}
                />
            )}
        </div>
    );
};
