import { AlgoAccounts } from './AlgoAccounts';
import React, { useMemo, useState } from 'react';
import type { Lead, LeadAudience, LeadQuality, Priority } from '../../db';
import { bulkArchiveLeads, bulkDeleteLeads, bulkMoveLeads, downloadLeadsCsv, exportLeadsCsv, listLeadStages, listLeads, moveLeadStage } from '../../services/leads';
import {
    LEAD_QUALITIES,
    LEAD_QUALITY_LABEL,
    LEAD_QUALITY_TONE,
    LEAD_SOURCES,
    normalizeSource,
    sourceLabel,
    stagesForAudience,
} from '../../services/algo';
import { getTagSuggestions } from '../../services/tags';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import { PRIORITIES, PRIORITY_LABEL } from '../../services/validation';
import type { WorkspaceNav } from '../../types/workspace';
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, PageHeader, SearchInput } from '../ui/Misc';
import { Icon } from '../ui/Icon';
import { OverflowMenu } from '../ui/OverflowMenu';
import { Drawer } from '../ui/Drawer';
import { Select } from '../ui/Form';
import { useToast } from '../ui/Toast';
import { DataState, PRIORITY_COLOR, PriorityDot, formatMoney } from './shared';
import { useAsyncData } from './useAsyncData';
import { LeadForm } from './LeadForm';
import { LeadDetail } from './LeadDetail';
import { LeadImportModal } from './LeadImportModal';

type ViewMode = 'kanban' | 'table';
type SortKey = 'updated' | 'name' | 'value' | 'created';

interface CRMViewProps {
    workspaceId: string;
    userId: string;
    audience?: LeadAudience;
    defaultView?: ViewMode;
    selectedLeadId: string | null;
    onCloseLead: () => void;
    nav: WorkspaceNav;
}

const PAGE_SIZE = 12;

export const CRMView: React.FC<CRMViewProps> = ({
    workspaceId,
    userId,
    audience = 'learner',
    defaultView = 'table',
    selectedLeadId,
    onCloseLead,
    nav,
}) => {
    const { user, members } = useAuth();
    const toast = useToast();
    const [algoOpen, setAlgoOpen] = useState(false);
    const [view, setView] = useState<ViewMode>(defaultView);
    const [search, setSearch] = useState('');
    const [stageFilter, setStageFilter] = useState('all');
    const [ownerFilter, setOwnerFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [qualityFilter, setQualityFilter] = useState<'all' | LeadQuality | 'unassessed'>('all');
    const [showArchived, setShowArchived] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [selectionMode, setSelectionMode] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>('updated');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverStage, setDragOverStage] = useState<string | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Lead | null>(null);
    const [importOpen, setImportOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [confirmArchive, setConfirmArchive] = useState(false);
    const [bulkStage, setBulkStage] = useState('');
    const [busy, setBusy] = useState(false);

    const { data, loading, error, reload } = useAsyncData(async () => {
        const [leads, stages, tagSuggestions] = await Promise.all([
            listLeads(workspaceId, showArchived),
            listLeadStages(workspaceId),
            getTagSuggestions(workspaceId),
        ]);
        return { leads, stages, tagSuggestions };
    }, [workspaceId, showArchived]);

    const leads = data?.leads || [];
    const stages = data?.stages || [];
    const audienceLeads = leads.filter(lead => (lead.audience || 'learner') === audience);
    const audienceStages = stagesForAudience(stages, audience);
    const isLearner = audience === 'learner';

    // The learner and institution modules share this view, so reset per-module
    // state whenever the audience changes.
    React.useEffect(() => {
        setView(defaultView);
        setSearch('');
        setStageFilter('all');
        setOwnerFilter('all');
        setPriorityFilter('all');
        setSourceFilter('all');
        setQualityFilter('all');
        setShowArchived(false);
        setFiltersOpen(false);
        setSelectionMode(false);
        setSelected(new Set());
        setPage(1);
        setFormOpen(false);
        setEditing(null);
        setImportOpen(false);
    }, [audience, defaultView]);

    const changeView = (next: ViewMode) => {
        setView(next);
        if (next === 'kanban') {
            setSelectionMode(false);
            setSelected(new Set());
        }
    };

    const activeFilterCount = [
        stageFilter !== 'all',
        ownerFilter !== 'all',
        priorityFilter !== 'all',
        sourceFilter !== 'all',
        qualityFilter !== 'all',
        showArchived,
    ].filter(Boolean).length;

    const clearFilters = () => {
        setStageFilter('all');
        setOwnerFilter('all');
        setPriorityFilter('all');
        setSourceFilter('all');
        setQualityFilter('all');
        setShowArchived(false);
        setPage(1);
        setSelected(new Set());
    };

    const toggleSelectionMode = () => {
        setSelectionMode(value => {
            if (value) setSelected(new Set());
            return !value;
        });
    };

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        let list = audienceLeads.filter(lead => {
            if (term && ![lead.name, lead.company, lead.email, lead.phone, lead.industry, lead.source, lead.sourceDetail, lead.dropOffReason].some(value => (value || '').toLowerCase().includes(term))) return false;
            if (stageFilter !== 'all' && lead.stageId !== stageFilter) return false;
            if (ownerFilter !== 'all' && lead.ownerId !== ownerFilter) return false;
            if (priorityFilter !== 'all' && lead.priority !== priorityFilter) return false;
            if (sourceFilter !== 'all' && (normalizeSource(lead.source) || 'unknown') !== sourceFilter) return false;
            if (qualityFilter !== 'all') {
                if (qualityFilter === 'unassessed' ? !!lead.quality : lead.quality !== qualityFilter) return false;
            }
            return true;
        });
        list = [...list].sort((a, b) => {
            const direction = sortDir === 'asc' ? 1 : -1;
            if (sortKey === 'name') return a.name.localeCompare(b.name) * direction;
            if (sortKey === 'value') return (a.value - b.value) * direction;
            if (sortKey === 'created') return (a.createdAt - b.createdAt) * direction;
            return (a.updatedAt - b.updatedAt) * direction;
        });
        return list;
    }, [audienceLeads, search, stageFilter, ownerFilter, priorityFilter, sourceFilter, qualityFilter, sortKey, sortDir]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    const allPageSelected = paged.length > 0 && paged.every(lead => selected.has(lead.id));

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(dir => (dir === 'asc' ? 'desc' : 'asc'));
        else {
            setSortKey(key);
            setSortDir(key === 'name' ? 'asc' : 'desc');
        }
    };

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAllPage = () => {
        setSelected(prev => {
            const next = new Set(prev);
            if (allPageSelected) paged.forEach(lead => next.delete(lead.id));
            else paged.forEach(lead => next.add(lead.id));
            return next;
        });
    };

    const runBulk = async (action: 'archive' | 'restore' | 'delete' | 'move') => {
        setBusy(true);
        try {
            const ids = Array.from(selected);
            if (action === 'delete') await bulkDeleteLeads(ids);
            else if (action === 'archive') await bulkArchiveLeads(ids, true);
            else if (action === 'restore') await bulkArchiveLeads(ids, false);
            else if (action === 'move' && bulkStage) await bulkMoveLeads(ids, bulkStage);
            toast.success(`${ids.length} ${isLearner ? 'learner' : 'institution'}${ids.length === 1 ? '' : 's'} updated.`);
            setSelected(new Set());
            setConfirmDelete(false);
            setConfirmArchive(false);
            setBulkStage('');
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const exportCsv = async (ids: string[]) => {
        try {
            const csv = await exportLeadsCsv(workspaceId, ids.length ? ids : filtered.map(lead => lead.id));
            downloadLeadsCsv(csv);
            toast.success('CSV exported.');
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const overflowItems = [
        {
            id: 'import',
            label: 'Import CSV',
            icon: 'upload' as const,
            onSelect: () => setImportOpen(true),
        },
        {
            id: 'export',
            label: selected.size ? `Export ${selected.size} selected` : 'Export CSV',
            icon: 'download' as const,
            onSelect: () => void exportCsv(Array.from(selected)),
        },
        {
            id: 'select',
            label: selectionMode ? 'Done selecting' : 'Select records',
            icon: 'check' as const,
            onSelect: toggleSelectionMode,
        },
    ];

    const dropOnStage = async (stageId: string) => {
        if (!draggingId) return;
        const lead = leads.find(item => item.id === draggingId);
        setDragOverStage(null);
        setDraggingId(null);
        if (!lead || lead.stageId === stageId) return;
        try {
            await moveLeadStage(lead.id, stageId);
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    return (
        <div className="ws-module">
            {algoOpen && <Drawer open onClose={() => setAlgoOpen(false)} label="ALGO accounts"><AlgoAccounts onClose={() => setAlgoOpen(false)} /></Drawer>}
            <div className="ws-module-inner">
                <PageHeader
                    title={isLearner ? 'Learners' : 'Institutions'}
                    subtitle={isLearner
                        ? `${audienceLeads.length} learner${audienceLeads.length === 1 ? '' : 's'} · activation starts with a challenge attempt, not a sign-up.`
                        : `${audienceLeads.length} institution${audienceLeads.length === 1 ? '' : 's'} · discovery, pilots and signed partnerships.`}
                    actions={(
                        <>
                            {isLearner && <Button onClick={() => setAlgoOpen(true)}>ALGO accounts</Button>}
                            <Button variant="primary" icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>
                                {isLearner ? 'Add learner' : 'Add institution'}
                            </Button>
                            <OverflowMenu label={isLearner ? 'Learner actions' : 'Institution actions'} items={overflowItems} />
                        </>
                    )}
                />

                <div className="ws-toolbar ws-toolbar-learner">
                    <SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder={isLearner ? 'Search learners, source, notes…' : 'Search institutions, contacts, notes…'} className="ws-search-wide" />
                    <Button
                        icon="filter"
                        variant={filtersOpen || activeFilterCount > 0 ? 'subtle' : 'secondary'}
                        onClick={() => setFiltersOpen(value => !value)}
                        aria-expanded={filtersOpen}
                        aria-controls="crm-filter-panel"
                    >
                        Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
                    </Button>
                    <span className="ws-toolbar-spacer" />
                    <div className="ws-segmented" role="group" aria-label="View">
                        <button
                            type="button"
                            className={view === 'table' ? 'active' : ''}
                            onClick={() => changeView('table')}
                            aria-pressed={view === 'table'}
                            title="Table view"
                        >
                            <Icon name="table" size={14} />
                            <span className="ws-view-label">Table</span>
                        </button>
                        <button
                            type="button"
                            className={view === 'kanban' ? 'active' : ''}
                            onClick={() => changeView('kanban')}
                            aria-pressed={view === 'kanban'}
                            title="Board view"
                        >
                            <Icon name="kanban" size={14} />
                            <span className="ws-view-label">Board</span>
                        </button>
                    </div>
                </div>

                {filtersOpen && (
                    <div className="ws-filter-panel" id="crm-filter-panel">
                        <div className="ws-filter-grid">
                            <Select value={stageFilter} onChange={e => { setStageFilter(e.target.value); setPage(1); }} aria-label="Filter by stage">
                                <option value="all">All stages</option>
                                {audienceStages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                            </Select>
                            <Select value={ownerFilter} onChange={e => { setOwnerFilter(e.target.value); setPage(1); }} aria-label="Filter by owner">
                                <option value="all">All owners</option>
                                {members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                            </Select>
                            <Select value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value as 'all' | Priority); setPage(1); }} aria-label="Filter by priority">
                                <option value="all">All priorities</option>
                                {PRIORITIES.map(priority => <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>)}
                            </Select>
                            <Select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }} aria-label="Filter by source">
                                <option value="all">All sources</option>
                                <option value="unknown">No source</option>
                                {LEAD_SOURCES.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}
                            </Select>
                            {isLearner && (
                                <Select value={qualityFilter} onChange={e => { setQualityFilter(e.target.value as 'all' | LeadQuality | 'unassessed'); setPage(1); }} aria-label="Filter by lead quality">
                                    <option value="all">All quality</option>
                                    {LEAD_QUALITIES.map(quality => <option key={quality.id} value={quality.id}>{quality.label}</option>)}
                                    <option value="unassessed">Not assessed</option>
                                </Select>
                            )}
                            <button
                                type="button"
                                className={`ws-filter-archive ${showArchived ? 'active' : ''}`}
                                onClick={() => { setShowArchived(value => !value); setPage(1); setSelected(new Set()); }}
                                aria-pressed={showArchived}
                            >
                                <Icon name="archive" size={15} /> Include archived
                            </button>
                            <Button variant="ghost" onClick={clearFilters} disabled={activeFilterCount === 0}>Clear filters</Button>
                        </div>
                    </div>
                )}

                {selected.size > 0 && (
                    <div className="ws-bulk-bar">
                        <strong>{selected.size} selected</strong>
                        <Button size="sm" icon="archive" onClick={() => setConfirmArchive(true)}>Archive</Button>
                        <Button size="sm" icon="refresh" onClick={() => void runBulk('restore')}>Restore</Button>
                        <Select value={bulkStage} onChange={e => setBulkStage(e.target.value)} aria-label="Move to stage">
                            <option value="">Move to stage…</option>
                            {audienceStages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                        </Select>
                        <Button size="sm" icon="arrow-right" disabled={!bulkStage} onClick={() => void runBulk('move')}>Move</Button>
                        {user?.role === 'admin' && <Button size="sm" variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>Delete</Button>}
                        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                    </div>
                )}

                <DataState loading={loading} error={error} onRetry={() => void reload()} />

                {!loading && !error && filtered.length === 0 && (
                    <EmptyState
                        icon="crm"
                        title={audienceLeads.length === 0 ? (isLearner ? 'No learners yet' : 'No institutions yet') : 'No records match these filters'}
                        description={audienceLeads.length === 0
                            ? (isLearner ? 'Add your first learner from the header, or bring in a CSV from the actions menu.' : 'Add a college or training institute from the header. Start with discovery, not a promised offer.')
                            : 'Try clearing the search or filters.'}
                    />
                )}

                {!loading && !error && filtered.length > 0 && view === 'kanban' && (
                    <div className="ws-pipeline">
                        {audienceStages.map(stage => {
                            const stageLeads = filtered.filter(lead => lead.stageId === stage.id);
                            const value = stageLeads.reduce((sum, lead) => sum + lead.value, 0);
                            const activated = stageLeads.filter(lead => (lead.challengeAttempts || 0) > 0).length;
                            return (
                                <div
                                    key={stage.id}
                                    className={`ws-pipeline-col ${dragOverStage === stage.id ? 'drag-over' : ''}`}
                                    onDragOver={event => { event.preventDefault(); setDragOverStage(stage.id); }}
                                    onDragLeave={() => setDragOverStage(current => (current === stage.id ? null : current))}
                                    onDrop={event => { event.preventDefault(); void dropOnStage(stage.id); }}
                                >
                                    <div className="ws-pipeline-head">
                                        <span className="ws-pipeline-dot" style={{ background: stage.color }} />
                                        <span className="ws-pipeline-name">{stage.name}</span>
                                        <span className="ws-pipeline-count">{stageLeads.length}</span>
                                    </div>
                                    <div className="ws-pipeline-value">
                                        {isLearner ? `${activated} activated · ${stageLeads.length} total` : `${formatMoney(value)} total value`}
                                    </div>
                                    <div className="ws-pipeline-body">
                                        {stageLeads.map(lead => (
                                            <article
                                                key={lead.id}
                                                className={`ws-lead-card ${draggingId === lead.id ? 'dragging' : ''}`}
                                                draggable
                                                tabIndex={0}
                                                role="button"
                                                aria-label={`Open ${lead.name}`}
                                                onDragStart={() => setDraggingId(lead.id)}
                                                onDragEnd={() => { setDraggingId(null); setDragOverStage(null); }}
                                                onClick={() => nav.openLead(lead.id)}
                                                onKeyDown={event => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        nav.openLead(lead.id);
                                                    }
                                                }}
                                            >
                                                <div className="ws-lead-card-top">
                                                    <div style={{ minWidth: 0 }}>
                                                        <div className="ws-lead-name">{lead.name}</div>
                                                        <div className="ws-lead-company">{lead.company || 'Independent'}</div>
                                                    </div>
                                                    <PriorityDot priority={lead.priority} />
                                                </div>
                                                {isLearner ? (
                                                    <div className="ws-lead-meta">
                                                        <span className="ws-lead-next">{sourceLabel(lead.source)}</span>
                                                        <span className="ws-lead-value">{lead.challengeAttempts || 0} attempt{(lead.challengeAttempts || 0) === 1 ? '' : 's'}</span>
                                                    </div>
                                                ) : (
                                                    <div className="ws-lead-meta">
                                                        <span className="ws-lead-value">{formatMoney(lead.value)}</span>
                                                        {lead.nextFollowUpAt ? (
                                                            <span className="ws-lead-next"><Icon name="clock" size={10} /> {formatDate(lead.nextFollowUpAt)}</span>
                                                        ) : (
                                                            <span className="ws-lead-next">{lead.ownerName}</span>
                                                        )}
                                                    </div>
                                                )}
                                                {(lead.quality || (lead.tags && lead.tags.length > 0)) && (
                                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 7 }}>
                                                        {isLearner && lead.quality && <Badge tone={LEAD_QUALITY_TONE[lead.quality]}>{LEAD_QUALITY_LABEL[lead.quality]}</Badge>}
                                                        {lead.tags.slice(0, 3).map(tag => <span key={tag.id} className="ws-chip" style={{ fontSize: 9, padding: '1px 6px' }}>{tag.name}</span>)}
                                                    </div>
                                                )}
                                            </article>
                                        ))}
                                        {stageLeads.length === 0 && <div className="ws-pipeline-empty">Drop records here</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!loading && !error && filtered.length > 0 && view === 'table' && (
                    <div className="ws-table-wrap">
                        <table className="ws-table">
                            <thead>
                                <tr>
                                    {selectionMode && <th className="ws-checkbox-cell"><label className="ws-check-target"><input type="checkbox" checked={allPageSelected} onChange={toggleAllPage} aria-label="Select all on page" /></label></th>}
                                    <th className="sortable" tabIndex={0} onClick={() => toggleSort('name')} onKeyDown={event => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            toggleSort('name');
                                        }
                                    }}>{isLearner ? 'Learner' : 'Institution'} {sortKey === 'name' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                                    {isLearner ? (
                                        <>
                                            <th>Source</th>
                                            <th>Quality</th>
                                            <th>Activation</th>
                                        </>
                                    ) : (
                                        <>
                                            <th>Organisation</th>
                                            <th className="sortable" tabIndex={0} onClick={() => toggleSort('value')} onKeyDown={event => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    toggleSort('value');
                                                }
                                            }}>Value {sortKey === 'value' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                                            <th>Priority</th>
                                        </>
                                    )}
                                    <th>Stage</th>
                                    <th>Owner</th>
                                    <th>Next follow-up</th>
                                    <th className="sortable" tabIndex={0} onClick={() => toggleSort('updated')} onKeyDown={event => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            toggleSort('updated');
                                        }
                                    }}>Updated {sortKey === 'updated' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                                    <th aria-hidden="true" />
                                </tr>
                            </thead>
                            <tbody>
                                {paged.map(lead => (
                                    <tr
                                        key={lead.id}
                                        className={`${selected.has(lead.id) ? 'selected' : ''} ws-table-row`}
                                        tabIndex={0}
                                        aria-label={`Open ${lead.name}`}
                                        onClick={() => selectionMode ? toggleSelect(lead.id) : nav.openLead(lead.id)}
                                        onKeyDown={event => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                if (selectionMode) toggleSelect(lead.id);
                                                else nav.openLead(lead.id);
                                            }
                                        }}
                                    >
                                        {selectionMode && (
                                            <td className="ws-checkbox-cell" onClick={event => event.stopPropagation()}>
                                                <label className="ws-check-target"><input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} aria-label={`Select ${lead.name}`} /></label>
                                            </td>
                                        )}
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <Avatar name={lead.name} size={28} />
                                                <div>
                                                    <div className="cell-title">{lead.name}</div>
                                                    <div className="cell-sub">{lead.email || lead.phone || lead.company || 'No contact details'}</div>
                                                </div>
                                                {lead.archived === 1 && <Badge tone="neutral">Archived</Badge>}
                                            </div>
                                        </td>
                                        {isLearner ? (
                                            <>
                                                <td>{sourceLabel(lead.source)}</td>
                                                <td>{lead.quality ? <Badge tone={LEAD_QUALITY_TONE[lead.quality]}>{LEAD_QUALITY_LABEL[lead.quality]}</Badge> : <span className="ws-muted">Not assessed</span>}</td>
                                                <td>
                                                    <div className="cell-title">{lead.challengeAttempts || 0} attempt{(lead.challengeAttempts || 0) === 1 ? '' : 's'}</div>
                                                    <div className="cell-sub">{lead.feedbackStatus === 'submitted' ? 'Feedback in' : lead.feedbackStatus === 'requested' ? 'Feedback requested' : 'No feedback yet'}</div>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td>{lead.company || '—'}</td>
                                                <td className="cell-mono">{formatMoney(lead.value)}</td>
                                                <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span className="ws-priority-dot" style={{ background: PRIORITY_COLOR[lead.priority] }} />{PRIORITY_LABEL[lead.priority]}</span></td>
                                            </>
                                        )}
                                        <td>{lead.stage ? <Badge tone="blue" dot color={lead.stage.color}>{lead.stage.name}</Badge> : '—'}</td>
                                        <td>{lead.ownerName}</td>
                                        <td>{lead.nextFollowUpAt ? formatDate(lead.nextFollowUpAt) : '—'}</td>
                                        <td>{formatDate(lead.updatedAt)}</td>
                                        <td className="ws-row-chevron" aria-hidden="true"><Icon name="chevron-right" size={15} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="ws-table-footer">
                            <span>{filtered.length} {isLearner ? 'learner' : 'institution'}{filtered.length === 1 ? '' : 's'} · page {currentPage} of {pageCount}</span>
                            <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} />
                        </div>
                    </div>
                )}
            </div>

            <LeadForm
                open={formOpen}
                workspaceId={workspaceId}
                currentUserId={userId}
                members={members}
                stages={stages}
                lead={editing}
                leadTags={editing ? leads.find(lead => lead.id === editing.id)?.tags.map(tag => tag.name) : []}
                tagSuggestions={data?.tagSuggestions || []}
                defaultAudience={audience}
                onClose={() => { setFormOpen(false); setEditing(null); }}
                onSaved={() => void reload()}
            />

            <LeadImportModal
                open={importOpen}
                workspaceId={workspaceId}
                onClose={() => setImportOpen(false)}
                onImported={() => void reload()}
            />

            <ConfirmDialog
                open={confirmDelete}
                title="Delete selected leads?"
                message={`This permanently deletes ${selected.size} lead${selected.size === 1 ? '' : 's'}, their activity history and links.`}
                confirmLabel="Delete leads"
                danger
                busy={busy}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => void runBulk('delete')}
            />
            <ConfirmDialog
                open={confirmArchive}
                title="Archive selected leads?"
                message={`${selected.size} lead${selected.size === 1 ? '' : 's'} will be hidden from the active pipeline until restored.`}
                confirmLabel="Archive"
                busy={busy}
                onCancel={() => setConfirmArchive(false)}
                onConfirm={() => void runBulk('archive')}
            />

            <Drawer
                open={!!selectedLeadId}
                onClose={onCloseLead}
                label={`${isLearner ? 'Learner' : 'Institution'} details`}
            >
                {selectedLeadId && (
                    <LeadDetail
                        workspaceId={workspaceId}
                        leadId={selectedLeadId}
                        nav={nav}
                        onBack={onCloseLead}
                        variant="drawer"
                    />
                )}
            </Drawer>
        </div>
    );
};

const Pagination: React.FC<{ page: number; pageCount: number; onChange: (page: number) => void }> = ({ page, pageCount, onChange }) => {
    const pages: number[] = [];
    for (let i = 1; i <= pageCount; i++) {
        if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) pages.push(i);
    }
    return (
        <div className="ws-pagination">
            <button disabled={page <= 1} onClick={() => onChange(page - 1)}>‹</button>
            {pages.map((value, index) => (
                <React.Fragment key={value}>
                    {index > 0 && value - pages[index - 1] > 1 && <span style={{ padding: '0 3px' }}>…</span>}
                    <button className={value === page ? 'active' : ''} onClick={() => onChange(value)}>{value}</button>
                </React.Fragment>
            ))}
            <button disabled={page >= pageCount} onClick={() => onChange(page + 1)}>›</button>
        </div>
    );
};

