import React, { useState } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Folder } from '../db';

interface FolderListProps {
    folders: Folder[];
    activeFolderId: string;
    onSelectFolder: (id: string) => void;
    onRenameFolder: (id: string, name: string) => void;
    onDeleteFolder: (id: string) => void;
    onMoveFolder: (activeId: string, overId: string) => void;
    onCreateSubfolder: (parentId: string) => void;
    onRequestMove: (folderId: string) => void;
    noteCounts: { [folderId: string]: number };
    editingFolderId: string | null;
    setEditingFolderId: (id: string | null) => void;
}

interface SortableFolderProps {
    folder: Folder;
    depth?: number;
    isActive: boolean;
    noteCount: number;
    onSelect: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    isEditing: boolean;
    editName: string;
    setEditName: (name: string) => void;
    saveRename: () => void;
    cancelRename: () => void;
    hasChildren: boolean;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
}

const SortableFolderItem = ({
    folder,
    isActive,
    noteCount,
    onSelect,
    onContextMenu,
    isEditing,
    editName,
    setEditName,
    saveRename,
    cancelRename,
    depth = 0,
    hasChildren,
    isCollapsed,
    onToggleCollapse
}: SortableFolderProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: folder.id, data: { type: 'folder', folder } });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        paddingLeft: `${12 + (depth * 16)}px`,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`folder-item ${isActive ? 'active' : ''}`}
            onClick={onSelect}
            onContextMenu={onContextMenu}
        >
            <span
                className={`folder-chevron ${hasChildren ? 'visible' : ''} ${isCollapsed ? 'collapsed' : ''}`}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse();
                }}
            >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </span>

            <span className="folder-icon">
                {isActive ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                )}
            </span>

            {isEditing ? (
                <input
                    className="folder-rename-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={saveRename}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename();
                        if (e.key === 'Escape') cancelRename();
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <span className="folder-name">{folder.name}</span>
            )}

            <span className="folder-count">{noteCount > 0 ? noteCount : ''}</span>
        </div>
    );
};

export const FolderList: React.FC<FolderListProps> = ({
    folders,
    activeFolderId,
    onSelectFolder,
    onRenameFolder,
    onDeleteFolder,
    onMoveFolder,
    onCreateSubfolder,
    onRequestMove,
    noteCounts,
    editingFolderId,
    setEditingFolderId
}) => {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const folderMap = new Map<string, Folder[]>();
    folders.forEach(f => {
        if (f.id === 'all') return;
        const pid = f.parentId || 'root';
        if (!folderMap.has(pid)) folderMap.set(pid, []);
        folderMap.get(pid)?.push(f);
    });

    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

    const toggleCollapse = (folderId: string) => {
        setCollapsedIds(prev => {
            const next = new Set(prev);
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            return next;
        });
    };

    const flatList: (Folder & { depth: number })[] = [];
    const traverse = (pid: string, depth: number) => {
        const children = folderMap.get(pid) || [];
        children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        children.forEach(f => {
            flatList.push({ ...f, depth });
            if (!collapsedIds.has(f.id)) traverse(f.id, depth + 1);
        });
    };
    traverse('root', 0);

    const draggableIds = flatList.map(f => f.id);
    const systemFolders = folders.filter(f => f.id === 'all');

    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, folderId: string } | null>(null);
    const [editName, setEditName] = useState('');

    const handleContextMenu = (e: React.MouseEvent, folderId: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, folderId });
    };

    const startRenaming = () => {
        if (contextMenu) {
            const f = folders.find(x => x.id === contextMenu.folderId);
            if (f) {
                setEditingFolderId(f.id);
                setEditName(f.name);
                setContextMenu(null);
            }
        }
    };

    React.useEffect(() => {
        if (editingFolderId) {
            const f = folders.find(x => x.id === editingFolderId);
            if (f) setEditName(f.name);
        }
    }, [editingFolderId, folders]);

    const handleDragStart = () => { };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            onMoveFolder(active.id as string, over.id as string);
        }
    };

    return (
        <div className="folders-list">
            {systemFolders.map(f => (
                <div
                    key={f.id}
                    className={`folder-item ${activeFolderId === f.id ? 'active' : ''}`}
                    onClick={() => onSelectFolder(f.id)}
                >
                    <span className="folder-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </span>
                    <span className="folder-name">{f.name}</span>
                    <span className="folder-count">{noteCounts[f.id] || 0}</span>
                </div>
            ))}

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={draggableIds}
                    strategy={verticalListSortingStrategy}
                >
                    {flatList.map(folder => {
                        const hasChildren = folderMap.has(folder.id) && folderMap.get(folder.id)!.length > 0;
                        return (
                            <SortableFolderItem
                                key={folder.id}
                                folder={folder}
                                isActive={activeFolderId === folder.id}
                                noteCount={noteCounts[folder.id] || 0}
                                onSelect={() => onSelectFolder(folder.id)}
                                onContextMenu={(e) => handleContextMenu(e, folder.id)}
                                isEditing={editingFolderId === folder.id}
                                editName={editName}
                                setEditName={setEditName}
                                saveRename={() => {
                                    if (editingFolderId) {
                                        onRenameFolder(editingFolderId, editName);
                                        setEditingFolderId(null);
                                    }
                                }}
                                cancelRename={() => setEditingFolderId(null)}
                                depth={folder.depth}
                                hasChildren={hasChildren}
                                isCollapsed={collapsedIds.has(folder.id)}
                                onToggleCollapse={() => toggleCollapse(folder.id)}
                            />
                        );
                    })}
                </SortableContext>
            </DndContext>

            {contextMenu && (
                <>
                    <div className="context-menu-backdrop" onClick={() => setContextMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                    <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x, zIndex: 100 }}>
                        <button onClick={() => { onCreateSubfolder(contextMenu.folderId); setContextMenu(null); }} className="menu-item">New Subfolder</button>
                        <div className="menu-divider" />
                        <button onClick={() => { onRequestMove(contextMenu.folderId); setContextMenu(null); }} className="menu-item">Move to...</button>
                        <button onClick={startRenaming} className="menu-item">Rename</button>
                        <button onClick={() => { onDeleteFolder(contextMenu.folderId); setContextMenu(null); }} className="menu-item delete">Delete</button>
                    </div>
                </>
            )}
        </div>
    );
};
