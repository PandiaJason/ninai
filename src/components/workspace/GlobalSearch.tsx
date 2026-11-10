import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { SearchResult, SearchType } from '../../services/search';
import { globalSearch } from '../../services/search';
import type { WorkspaceNav } from '../../types/workspace';
import { Icon, type IconName } from '../ui/Icon';
import { useDebouncedValue, useAsyncData } from './useAsyncData';

const FILTERS: { id: SearchType | 'all'; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'lead', label: 'Leads' },
    { id: 'task', label: 'Tasks' },
    { id: 'note', label: 'Notes' },
    { id: 'folder', label: 'Folders' },
];

const TYPE_META: Record<SearchType, { icon: IconName; label: string }> = {
    lead: { icon: 'crm', label: 'Lead' },
    task: { icon: 'tasks', label: 'Task' },
    note: { icon: 'notes', label: 'Note' },
    folder: { icon: 'folder', label: 'Folder' },
};

interface GlobalSearchProps {
    open: boolean;
    workspaceId: string;
    nav: WorkspaceNav;
    onClose: () => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ open, workspaceId, nav, onClose }) => {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<SearchType | 'all'>('all');
    const [active, setActive] = useState(0);
    const debounced = useDebouncedValue(query, 220);
    const inputRef = useRef<HTMLInputElement>(null);

    const { data, loading, error } = useAsyncData<SearchResult[]>(
        () => (debounced.trim() ? globalSearch(workspaceId, debounced, filter === 'all' ? undefined : [filter]) : Promise.resolve([])),
        [workspaceId, debounced, filter],
    );
    const results = data || [];

    useEffect(() => {
        if (!open) return;
        setQuery('');
        setFilter('all');
        setActive(0);
        window.setTimeout(() => inputRef.current?.focus(), 30);
    }, [open]);

    useEffect(() => {
        setActive(0);
    }, [debounced, filter]);

    const grouped = useMemo(() => {
        const map = new Map<SearchType, SearchResult[]>();
        results.forEach(result => {
            if (!map.has(result.type)) map.set(result.type, []);
            map.get(result.type)!.push(result);
        });
        return Array.from(map.entries());
    }, [results]);

    if (!open) return null;

    const choose = (result: SearchResult) => {
        onClose();
        if (result.type === 'lead') nav.openLead(result.id);
        else if (result.type === 'task') nav.openTask(result.id);
        else if (result.type === 'note') nav.openNote(result.id);
        else nav.go('notes');
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            onClose();
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive(index => Math.min(results.length - 1, index + 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(index => Math.max(0, index - 1));
        } else if (event.key === 'Enter' && results[active]) {
            event.preventDefault();
            choose(results[active]);
        }
    };

    let rowIndex = -1;

    return (
        <div className="ws-search-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
            <div className="ws-search-panel" role="dialog" aria-modal="true" aria-label="Global search">
                <div className="ws-search-input-row">
                    <Icon name="search" size={18} />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Search leads, tasks, notes and folders…"
                        aria-label="Search workspace"
                    />
                    <span className="ws-search-kbd">Esc</span>
                    <button className="ws-icon-btn" onClick={onClose} aria-label="Close search"><Icon name="x" size={16} /></button>
                </div>

                <div className="ws-search-filters">
                    {FILTERS.map(item => (
                        <button
                            key={item.id}
                            className={`ws-search-filter ${filter === item.id ? 'active' : ''}`}
                            onClick={() => setFilter(item.id)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>

                <div className="ws-search-results">
                    {!debounced.trim() && (
                        <div className="ws-search-empty">Type to search across your workspace.</div>
                    )}
                    {debounced.trim() && loading && <div className="ws-search-empty">Searching…</div>}
                    {error && <div className="ws-search-empty">{error}</div>}
                    {debounced.trim() && !loading && !error && results.length === 0 && (
                        <div className="ws-search-empty">No matches for “{debounced.trim()}”.</div>
                    )}
                    {grouped.map(([type, items]) => (
                        <div key={type}>
                            <div className="ws-search-group-label">{TYPE_META[type].label}s</div>
                            {items.map(result => {
                                rowIndex++;
                                const index = rowIndex;
                                return (
                                    <button
                                        key={`${result.type}-${result.id}`}
                                        className={`ws-search-result ${index === active ? 'active' : ''}`}
                                        onMouseEnter={() => setActive(index)}
                                        onClick={() => choose(result)}
                                    >
                                        <span className="ws-search-result-icon"><Icon name={TYPE_META[result.type].icon} size={15} /></span>
                                        <span className="ws-search-result-body">
                                            <span className="ws-search-result-title">{result.title}</span>
                                            <span className="ws-search-result-sub">{result.subtitle}</span>
                                        </span>
                                        <Icon name="arrow-right" size={14} />
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
