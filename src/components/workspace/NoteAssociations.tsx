import React, { useState } from 'react';
import type { Tag } from '../../db';
import { getNoteLinks, linkNote, unlinkNote } from '../../services/notes';
import { getTagsForEntity, getTagSuggestions, setTagsForEntity } from '../../services/tags';
import { listLeads } from '../../services/leads';
import { listTasks } from '../../services/tasks';
import { toErrorMessage } from '../../services/errors';
import { Modal } from '../ui/Modal';
import { Button, SearchInput } from '../ui/Misc';
import { Icon, type IconName } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { useAsyncData } from './useAsyncData';

type LinkableType = 'lead' | 'task';

const TYPE_ICON: Record<LinkableType, IconName> = { lead: 'crm', task: 'tasks' };

interface PickerItem {
    id: string;
    title: string;
    subtitle: string;
    type: LinkableType;
}

interface NoteAssociationsProps {
    workspaceId: string;
    noteId: string;
}

export const NoteAssociations: React.FC<NoteAssociationsProps> = ({ workspaceId, noteId }) => {
    const toast = useToast();
    const [linking, setLinking] = useState(false);
    const [tagMode, setTagMode] = useState(false);
    const [tagDraft, setTagDraft] = useState('');

    const { data, reload } = useAsyncData(
        () => Promise.all([getNoteLinks(noteId), getTagsForEntity('note', noteId), getTagSuggestions(workspaceId)]),
        [workspaceId, noteId],
    );
    const [links, tags, suggestions] = data || [[], [] as Tag[], [] as string[]];

    const addTag = async () => {
        const name = tagDraft.trim();
        if (!name) {
            setTagMode(false);
            return;
        }
        try {
            await setTagsForEntity(workspaceId, 'note', noteId, [...tags.map(t => t.name), name]);
            setTagDraft('');
            setTagMode(false);
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const removeTag = async (tag: Tag) => {
        try {
            await setTagsForEntity(workspaceId, 'note', noteId, tags.filter(t => t.id !== tag.id).map(t => t.name));
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const removeLink = async (id: string) => {
        try {
            await unlinkNote(id);
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    return (
        <>
            <div className="note-meta-bar">
                <span className="note-meta-label">Links</span>
                {links.map(link => (
                    <span className="note-link-chip" key={link.id}>
                        <Icon name={TYPE_ICON[link.entityType as LinkableType] || 'link'} size={11} />
                        {link.title}
                        <button onClick={() => void removeLink(link.id)} aria-label={`Unlink ${link.title}`}><Icon name="x" size={10} /></button>
                    </span>
                ))}
                <button className="note-meta-add" onClick={() => setLinking(true)}>
                    <Icon name="plus" size={10} /> Link
                </button>

                <span style={{ flex: 1 }} />

                {tags.map(tag => (
                    <span className="note-link-chip note-meta-tag" key={tag.id}>
                        #{tag.name}
                        <button onClick={() => void removeTag(tag)} aria-label={`Remove tag ${tag.name}`}><Icon name="x" size={10} /></button>
                    </span>
                ))}
                {tagMode ? (
                    <input
                        className="note-meta-tag-input"
                        value={tagDraft}
                        autoFocus
                        onChange={e => setTagDraft(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') void addTag();
                            if (e.key === 'Escape') { setTagMode(false); setTagDraft(''); }
                        }}
                        onBlur={() => void addTag()}
                        placeholder="Tag name"
                        list="note-tag-suggestions"
                    />
                ) : (
                    <button className="note-meta-add" onClick={() => setTagMode(true)}>
                        <Icon name="tag" size={10} /> Tag
                    </button>
                )}
                <datalist id="note-tag-suggestions">
                    {suggestions.map(name => <option key={name} value={name} />)}
                </datalist>
            </div>

            <LinkPicker
                open={linking}
                workspaceId={workspaceId}
                noteId={noteId}
                existingKeys={links.map(link => `${link.entityType}:${link.entityId}`)}
                onClose={() => setLinking(false)}
                onLinked={async () => { setLinking(false); await reload(); }}
            />
        </>
    );
};

const LinkPicker: React.FC<{
    open: boolean;
    workspaceId: string;
    noteId: string;
    existingKeys: string[];
    onClose: () => void;
    onLinked: () => Promise<void>;
}> = ({ open, workspaceId, noteId, existingKeys, onClose, onLinked }) => {
    const toast = useToast();
    const [tab, setTab] = useState<LinkableType>('lead');
    const [search, setSearch] = useState('');
    const [busyId, setBusyId] = useState('');

    const { data, loading } = useAsyncData<PickerItem[]>(async () => {
        if (!open) return [];
        if (tab === 'lead') {
            const leads = await listLeads(workspaceId);
            return leads.map(lead => ({ id: lead.id, title: lead.name, subtitle: lead.company || lead.email || 'Lead', type: 'lead' as const }));
        }
        const tasks = await listTasks(workspaceId);
        return tasks.map(task => ({ id: task.id, title: task.title, subtitle: task.leadName ? `Lead: ${task.leadName}` : 'Task', type: 'task' as const }));
    }, [open, workspaceId, tab]);

    const items = (data || []).filter(item => !search || item.title.toLowerCase().includes(search.toLowerCase()) || item.subtitle.toLowerCase().includes(search.toLowerCase()));

    const link = async (item: PickerItem) => {
        setBusyId(item.id);
        try {
            await linkNote(workspaceId, noteId, item.type, item.id);
            toast.success('Note linked.');
            await onLinked();
            setSearch('');
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusyId('');
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Link this note"
            subtitle="Connect the note to a lead or task."
            size="md"
        >
            <div className="ws-segmented" style={{ marginBottom: 12 }}>
                {(['lead', 'task'] as const).map(type => (
                    <button key={type} className={tab === type ? 'active' : ''} onClick={() => setTab(type)}>
                        {type === 'lead' ? 'Leads' : 'Tasks'}
                    </button>
                ))}
            </div>
            <SearchInput value={search} onChange={setSearch} placeholder="Filter…" />
            <div className="ws-picker-list" style={{ marginTop: 12 }}>
                {loading && <div className="ws-muted">Loading…</div>}
                {!loading && items.length === 0 && <div className="ws-muted">Nothing to link yet.</div>}
                {items.map(item => {
                    const key = `${item.type}:${item.id}`;
                    const already = existingKeys.includes(key);
                    return (
                        <button
                            key={key}
                            className={`ws-picker-item ${already ? 'selected' : ''}`}
                            disabled={already || busyId === item.id}
                            onClick={() => void link(item)}
                        >
                            <span className="ws-search-result-icon" style={{ width: 28, height: 28 }}><Icon name={TYPE_ICON[item.type]} size={13} /></span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span className="ws-picker-title" style={{ display: 'block' }}>{item.title}</span>
                                <span className="ws-picker-sub">{item.subtitle}</span>
                            </span>
                            {already ? <span className="ws-small ws-muted">Linked</span> : <Icon name="plus" size={14} />}
                        </button>
                    );
                })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <Button onClick={onClose}>Done</Button>
            </div>
        </Modal>
    );
};
