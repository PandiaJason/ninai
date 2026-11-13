import React, { useMemo, useState } from 'react';
import type { GmailMessage, GmailSignal } from '../../db';
import type { WorkspaceNav } from '../../types/workspace';
import { STUCK_CATEGORIES } from '../../services/algo';
import {
    applyGmailMessage,
    countPendingGmailMessages,
    getGmailConnection,
    ignoreGmailMessage,
    listGmailMessages,
    syncGmail,
    type ApplyGmailOptions,
} from '../../services/gmailSync';
import { toErrorMessage } from '../../services/errors';
import { Avatar, Badge, Button, EmptyState, PageHeader, SearchInput, SectionCard } from '../ui/Misc';
import { Icon, type IconName } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { useAsyncData } from './useAsyncData';
import { formatDate, formatDateTime } from '../../services/validation';

interface GmailViewProps {
    workspaceId: string;
    nav: WorkspaceNav;
}

type Filter = 'new' | 'applied' | 'ignored' | 'all';

const SIGNALS: { id: GmailSignal; label: string; icon: IconName; tone: 'neutral' | 'blue' | 'green' | 'orange' | 'purple' }[] = [
    { id: 'challenge', label: 'Challenge submitted', icon: 'target', tone: 'green' },
    { id: 'feedback', label: 'Feedback reply', icon: 'message', tone: 'blue' },
    { id: 'question', label: 'Question', icon: 'sparkles', tone: 'orange' },
    { id: 'meeting', label: 'Wants a call', icon: 'calendar', tone: 'purple' },
    { id: 'other', label: 'No signal', icon: 'mail', tone: 'neutral' },
];

const signalMeta = (signal: GmailSignal) => SIGNALS.find(item => item.id === signal) || SIGNALS[4];

interface Extraction {
    track?: string;
    tracks?: string[];
    whyStarted?: string;
    whereStuck?: string;
    stuckCategory?: string;
    fdeHelpRating?: number;
    question?: string;
    consentToContact?: boolean;
    reasons?: string[];
}

function parseExtraction(message: GmailMessage): Extraction {
    try {
        return JSON.parse(message.extracted || '{}') as Extraction;
    } catch {
        return {};
    }
}

function stuckLabel(value?: string): string {
    if (!value) return '';
    const match = STUCK_CATEGORIES.find(item => item.id === value);
    return match ? match.label : value;
}

export const GmailView: React.FC<GmailViewProps> = ({ workspaceId, nav }) => {
    const toast = useToast();
    const [filter, setFilter] = useState<Filter>('new');
    const [search, setSearch] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [ratings, setRatings] = useState<Record<string, number>>({});
    const [categories, setCategories] = useState<Record<string, string>>({});

    const { data, loading, error, reload } = useAsyncData(async () => {
        const [connection, messages, pending] = await Promise.all([
            getGmailConnection(workspaceId),
            listGmailMessages(workspaceId),
            countPendingGmailMessages(workspaceId),
        ]);
        return { connection, messages, pending };
    }, [workspaceId]);

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return (data?.messages || []).filter(message => {
            if (filter !== 'all' && message.status !== filter) return false;
            if (!term) return true;
            return `${message.subject} ${message.from} ${message.lead?.name || ''}`.toLowerCase().includes(term);
        });
    }, [data?.messages, filter, search]);

    const runSync = async () => {
        setSyncing(true);
        try {
            const summary = await syncGmail(workspaceId);
            toast.success(`${summary.new} new email${summary.new === 1 ? '' : 's'} from ${summary.matched} learner${summary.matched === 1 ? '' : 's'}.`);
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setSyncing(false);
        }
    };

    const apply = async (message: GmailMessage) => {
        setBusyId(message.id);
        try {
            const extraction = parseExtraction(message);
            const options: ApplyGmailOptions = {
                fdeHelpRating: ratings[message.id] ?? extraction.fdeHelpRating,
                stuckCategory: (categories[message.id] || extraction.stuckCategory) as ApplyGmailOptions['stuckCategory'],
            };
            await applyGmailMessage(message.id, options);
            toast.success('Applied to the learner record.');
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusyId(null);
        }
    };

    const dismiss = async (message: GmailMessage) => {
        setBusyId(message.id);
        try {
            await ignoreGmailMessage(message.id);
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusyId(null);
        }
    };

    if (!data) {
        return (
            <div className="ws-module"><div className="ws-module-inner">
                <div className="ws-loading"><span className="ws-spinner" /><span>Loading Gmail…</span></div>
            </div></div>
        );
    }

    const { connection, pending } = data;
    const connectionLabel = connection
        ? `Connected as ${connection.email}${connection.lastSyncedAt ? ` · last synced ${formatDateTime(connection.lastSyncedAt)}` : ''}`
        : 'No Gmail account connected yet.';

    return (
        <div className="ws-module ws-gmail">
            <div className="ws-module-inner">
                <PageHeader
                    eyebrow="Gmail"
                    title="Learner updates"
                    subtitle="Emails from your learners, matched to records, waiting for your review before anything changes."
                    actions={(
                        <Button
                            variant="primary"
                            icon="refresh"
                            onClick={() => void runSync()}
                            loading={syncing}
                            disabled={!connection}
                        >
                            Sync now
                        </Button>
                    )}
                />

                {!connection && (
                    <SectionCard
                        className="ws-gmail-connect"
                        title="Connect a Gmail account"
                        description="Ninai reads your inbox read-only and only looks at emails sent by your learners. Nothing is sent, deleted or modified in Gmail."
                    >
                        <div className="ws-gmail-connect-body">
                            <p className="ws-gmail-connect-note">
                                Add a Google OAuth desktop client id in <strong>Settings → Gmail</strong>, then connect from there. The consent screen opens in your browser and signs you in with Google.
                            </p>
                            <Button variant="secondary" icon="settings" onClick={() => nav.go('settings')}>
                                Open settings
                            </Button>
                        </div>
                    </SectionCard>
                )}

                {connection && (
                    <div className="ws-gmail-status">
                        <span className="ws-gmail-status-dot" />
                        <span>{connectionLabel}</span>
                        {pending > 0 && <Badge tone="blue">{pending} to review</Badge>}
                    </div>
                )}

                <div className="ws-toolbar">
                    <SearchInput value={search} onChange={setSearch} placeholder="Search subject, learner, sender…" className="ws-search-wide" />
                    <span className="ws-toolbar-spacer" />
                    <div className="ws-segmented" role="group" aria-label="Filter">
                        {([
                            { id: 'new' as Filter, label: 'To review' },
                            { id: 'applied' as Filter, label: 'Applied' },
                            { id: 'ignored' as Filter, label: 'Dismissed' },
                            { id: 'all' as Filter, label: 'All' },
                        ]).map(item => (
                            <button
                                key={item.id}
                                type="button"
                                className={filter === item.id ? 'active' : ''}
                                onClick={() => setFilter(item.id)}
                                aria-pressed={filter === item.id}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                {error && <div className="ws-form-error">{error}</div>}

                {loading && <div className="ws-loading"><span className="ws-spinner" /><span>Loading emails…</span></div>}

                {!loading && visible.length === 0 && (
                    <EmptyState
                        icon="mail"
                        title={filter === 'new' ? 'Nothing to review' : 'No emails here'}
                        description={filter === 'new'
                            ? (connection ? 'Run a sync to look for new messages from your learners.' : 'Connect a Gmail account to start pulling learner emails.')
                            : 'Try another filter or clear the search.'}
                    />
                )}

                <div className="ws-gmail-list">
                    {visible.map(message => {
                        const meta = signalMeta(message.signal);
                        const extraction = parseExtraction(message);
                        const rating = ratings[message.id] ?? extraction.fdeHelpRating ?? 3;
                        const category = categories[message.id] || extraction.stuckCategory || 'other';
                        const lead = message.lead;
                        const isFeedback = message.signal === 'feedback';
                        return (
                            <article key={message.id} className={`ws-gmail-card ${message.status !== 'new' ? 'is-done' : ''}`}>
                                <header className="ws-gmail-card-head">
                                    <Avatar name={lead?.name || message.from} size={30} />
                                    <div className="ws-gmail-card-title">
                                        <strong>{lead?.name || 'Unmatched sender'}</strong>
                                        <span>{lead?.email || message.from}</span>
                                    </div>
                                    <Badge tone={meta.tone}>{meta.label}</Badge>
                                    <span className="ws-gmail-card-date">{formatDate(message.receivedAt)}</span>
                                </header>

                                <div className="ws-gmail-card-subject">{message.subject}</div>
                                <p className="ws-gmail-card-body">{message.snippet}</p>

                                {(extraction.track || extraction.fdeHelpRating !== undefined || extraction.stuckCategory || extraction.question) && (
                                    <div className="ws-gmail-chips">
                                        {extraction.track && <Badge tone="neutral">Track: {extraction.track}</Badge>}
                                        {extraction.fdeHelpRating !== undefined && <Badge tone="blue">Rating: {extraction.fdeHelpRating}/5</Badge>}
                                        {extraction.stuckCategory && <Badge tone="orange">Stuck: {stuckLabel(extraction.stuckCategory)}</Badge>}
                                        {extraction.question && <Badge tone="purple">Question</Badge>}
                                    </div>
                                )}

                                {message.status === 'new' && lead && (
                                    <footer className="ws-gmail-card-actions">
                                        {isFeedback && (
                                            <>
                                                <label className="ws-gmail-field">
                                                    FDE help
                                                    <select
                                                        value={rating}
                                                        onChange={event => setRatings(current => ({ ...current, [message.id]: Number(event.target.value) }))}
                                                    >
                                                        {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}/5</option>)}
                                                    </select>
                                                </label>
                                                <label className="ws-gmail-field">
                                                    Stuck on
                                                    <select
                                                        value={category}
                                                        onChange={event => setCategories(current => ({ ...current, [message.id]: event.target.value }))}
                                                    >
                                                        {STUCK_CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                                                    </select>
                                                </label>
                                            </>
                                        )}
                                        <span className="ws-toolbar-spacer" />
                                        <Button size="sm" variant="ghost" onClick={() => void dismiss(message)} loading={busyId === message.id}>
                                            Dismiss
                                        </Button>
                                        <Button size="sm" variant="primary" icon="check" onClick={() => void apply(message)} loading={busyId === message.id}>
                                            Apply
                                        </Button>
                                    </footer>
                                )}

                                {message.status !== 'new' && (
                                    <footer className="ws-gmail-card-actions">
                                        <span className="ws-gmail-card-state">
                                            <Icon name={message.status === 'applied' ? 'circle-check' : 'x'} size={13} />
                                            {message.status === 'applied' ? 'Applied to the learner record' : 'Dismissed'}
                                        </span>
                                    </footer>
                                )}
                            </article>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
