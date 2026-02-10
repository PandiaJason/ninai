import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEditor, EditorContent, wrappingInputRule } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import { Markdown } from 'tiptap-markdown';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { db } from '../db';
import type { Note } from '../db';
import './NotesPanel.css';
import { FolderList } from './FolderList';
import { exportToMarkdown, insertMarkdown } from '../services/llm';
import { NotePreviewCard } from './NotePreviewCard';
import { useDebounce } from '../hooks/useDebounce';

interface NotesPanelProps {
    zenMode?: boolean;
    onToggleZenMode?: () => void;
    onImportFromWebview?: () => Promise<{ text: string, html: string } | null>;
}

export const NotesPanel: React.FC<NotesPanelProps> = ({ zenMode = false, onToggleZenMode, onImportFromWebview }) => {

    // Internal Component for Export Button with Feedback
    const ExportButton = ({ editor }: { editor: any }) => {
        const [status, setStatus] = useState<'idle' | 'copied'>('idle');

        const handleExport = async () => {
            // console.log('Export button clicked');
            if (!editor) return;
            const md = exportToMarkdown(editor);

            try {
                // @ts-ignore
                if (window.electronAPI?.clipboard) {
                    // @ts-ignore
                    window.electronAPI.clipboard.writeText(md);
                } else {
                    await navigator.clipboard.writeText(md);
                }

                setStatus('copied');
                setTimeout(() => setStatus('idle'), 2000);
            } catch (err) {
                console.error('Export failed:', err);
                alert(`Failed to copy: ${err}`);
            }
        };

        const handleDragStart = (e: React.DragEvent) => {
            if (!editor) return;
            const md = exportToMarkdown(editor);
            e.dataTransfer.setData('text/plain', md);
            e.dataTransfer.effectAllowed = 'copy';
            // console.log("Drag started with content length:", md.length);
        };

        return (
            <button
                className="icon-btn-ghost"
                draggable
                onDragStart={handleDragStart}
                onClick={handleExport}
                title="Copy Context for AI (Click or Drag to LLM)"
                style={{
                    color: status === 'copied' ? '#10b981' : '#3b82f6', // Blue 500
                    transition: 'all 0.2s',
                    cursor: 'grab'
                }}
            >
                {status === 'copied' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                ) : (
                    // Sparkles Icon (Abstract "AI Context")
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                    </svg>
                )}
            </button>
        );
    };

    // --- DB Migration on Mount ---
    useEffect(() => {
        db.populateFromLocalStorage().catch(console.error);
    }, []);


    // --- Live Data ---
    const folders = useLiveQuery(async () => {
        const all = await db.folders.toArray();
        return all.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }) || [];
    const notes = useLiveQuery(() => db.notes.orderBy('updatedAt').reverse().toArray()) || [];

    const [activeFolderId, setActiveFolderId] = useState<string>('ninai');
    const [activeNoteId, setActiveNoteId] = useState<string | null>(() => localStorage.getItem('ninai_active_note'));

    useEffect(() => {
        if (activeNoteId) localStorage.setItem('ninai_active_note', activeNoteId);
    }, [activeNoteId]);

    // --- Logic ---
    const [searchTerm, setSearchTerm] = useState('');
    const [showFolders, setShowFolders] = useState(true);
    const [showList, setShowList] = useState(true);
    const [showEditor, setShowEditor] = useState(true);
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    // --- Resizing Logic ---
    const [folderWidth, setFolderWidth] = useState(200);
    const [listWidth, setListWidth] = useState(240);
    const isResizing = useRef<null | 'folder' | 'list'>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            if (isResizing.current === 'folder') {
                const newW = e.clientX;
                if (newW > 100 && newW < 600) setFolderWidth(newW);
            } else if (isResizing.current === 'list') {
                const sidebarEl = document.querySelector('.folders-sidebar') as HTMLElement;
                const sidebarW = sidebarEl ? sidebarEl.getBoundingClientRect().width : 0;
                const newW = e.clientX - sidebarW;
                if (newW > 150 && newW < 800) setListWidth(newW);
            }
        };
        const handleMouseUp = () => { isResizing.current = null; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
    }, []);

    // --- Auto-Collapse Logic (Responsive) ---
    const panelRef = useRef<HTMLDivElement>(null);
    const prevWidth = useRef<number>(0);

    const handleNoteClick = React.useCallback((noteId: string) => {
        setActiveNoteId(noteId);
        if (!showEditor) setShowEditor(true);
        // Auto-close sidebar on mobile/narrow
        if (panelRef.current && panelRef.current.getBoundingClientRect().width < 1000) {
            setShowFolders(false);
            setShowList(false);
        }
    }, [showEditor]);

    useEffect(() => {
        if (!panelRef.current) return;
        // @ts-ignore
        if (!window.electronAPI) {
            console.error("FATAL: electronAPI missing.");
            if (process.env.NODE_ENV === 'development') {
                // alert("Desktop Bridge Missing!");
            }
        }

        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                if ((prevWidth.current === 0 || prevWidth.current > 500) && width <= 500) {
                    setShowFolders(false);
                }
                else if (prevWidth.current > 0 && prevWidth.current <= 600 && width > 600) {
                    setShowFolders(true);
                    setShowList(true); // Ensure 3-pane view is fully restored
                }
                prevWidth.current = width;
            }
        });

        ro.observe(panelRef.current);
        return () => ro.disconnect();
    }, []);

    const startResizing = (type: 'folder' | 'list') => (_e: React.MouseEvent) => {
        isResizing.current = type;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const isFullScreen = !showFolders && !showList && showEditor;
    const toggleFullScreen = () => {
        if (isFullScreen) {
            setShowFolders(true);
            setShowList(true);
        } else {
            setShowFolders(false);
            setShowList(false);
            setShowEditor(true);
        }
    };

    const filteredFolders = React.useMemo(() => folders.filter(f =>
        f.name.toLowerCase().includes(searchTerm.toLowerCase())
    ), [folders, searchTerm]);

    const filteredNotes = React.useMemo(() => activeFolderId === 'all'
        ? notes
        : notes.filter(n => n.folderId === activeFolderId), [activeFolderId, notes]);

    const searchResults = React.useMemo(() => searchTerm
        ? notes.filter(n =>
            n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            n.content.toLowerCase().includes(searchTerm.toLowerCase())
        )
        : filteredFolders.length > 0 ? filteredNotes : [], [searchTerm, notes, filteredFolders.length, filteredNotes]);

    const displayNotes = React.useMemo(() => searchTerm
        ? searchResults
        : filteredNotes, [searchTerm, searchResults, filteredNotes]);

    const activeNote = React.useMemo(() => notes.find(n => n.id === activeNoteId), [notes, activeNoteId]);

    // --- TipTap Editor Setup ---
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = 'Data is being saved. Please wait a moment.';
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    const debouncedUpdateNote = useDebounce(async (id: string, updates: Partial<Note>) => {
        await db.notes.update(id, { ...updates, updatedAt: new Date() });
        setIsDirty(false); // Saved
    }, 500);

    const updateNote = (field: 'title' | 'content', value: string) => {
        if (!activeNoteId) return;
        setIsDirty(true);
        debouncedUpdateNote(activeNoteId, { [field]: value });
    };

    // Extension for highlighting the active block
    const ActiveBlockHighlight = Extension.create({
        name: 'activeBlockHighlight',
        addProseMirrorPlugins() {
            return [
                new Plugin({
                    key: new PluginKey('activeBlockHighlight'),
                    props: {
                        decorations(state) {
                            const { selection } = state;
                            const { $from } = selection;
                            // Decorations to return
                            const decorations: Decoration[] = [];

                            // Find the block/node at the cursor
                            // We want to highlight the direct child of doc or the closest block container?
                            // Usually depth 1 is doc, depth 2 is paragraph.
                            // But let's just highlight the parent node of the selection.
                            // However, we want the block-level element like P, H1, H2, LI...

                            // Walk up from current depth to find a block node
                            let currentDepth = $from.depth;
                            let node = $from.node(currentDepth);

                            // If it's text node (which tiptap handles abstractly, but in PM selection is in text usually inside a block)
                            // $from.parent is the block containing the text.
                            // So usually just $from.depth is enough.

                            // Safety check
                            if ($from.depth > 0) {
                                // Calculate the start pos of the node
                                const startPos = $from.before(currentDepth);
                                // Decoration.node applies class to the node wrapper
                                decorations.push(
                                    Decoration.node(startPos, startPos + node.nodeSize, {
                                        class: 'active-block',
                                    })
                                );
                            }

                            return DecorationSet.create(state.doc, decorations);
                        },
                    },
                }),
            ];
        },
    });

    const editor = useEditor({
        extensions: [
            StarterKit,
            Markdown.configure({
                transformPastedText: false, // Handled manually
                transformCopiedText: false,
                html: true, // Fix persistence issue (allow loading HTML)
            }),
            Image.configure({
                inline: true,
                allowBase64: true,
            }),
            Placeholder.configure({
                placeholder: 'Start typing...',
            }),
            TaskList,
            TaskItem.extend({
                addInputRules() {
                    return [
                        wrappingInputRule({
                            find: /^\s*(\[\])\s$/,
                            type: this.type,
                            getAttributes: () => ({ checked: false }),
                        }),
                        ...(this.parent?.() || [])
                    ]
                }
            }).configure({
                nested: true,
            }),
            Link.configure({
                openOnClick: false,
                autolink: true,
            }),
            Table.configure({
                resizable: true,
            }),
            TableRow,
            TableHeader,
            TableCell,
            ActiveBlockHighlight,
        ],
        editorProps: {
            attributes: {
                class: 'markdown-preview-canvas focus:outline-none min-h-[50vh]',
            },
            // HandlePaste moved to useEffect below for access to Editor instance
        },
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            updateNote('content', html);
        },
    });

    // Handle Paste (Images + Smart Text)
    useEffect(() => {
        if (!editor) return;

        const handlePasteHandler = (view: any, event: ClipboardEvent) => {
            const clipboardData = event.clipboardData;
            if (!clipboardData) return false;

            // --- Optimized Image Logic ---
            const optimizeImage = (blob: File | Blob): Promise<string> => {
                return new Promise((resolve, reject) => {
                    const img = new window.Image();
                    const url = URL.createObjectURL(blob);
                    img.onload = () => {
                        try {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            const MAX_WIDTH = 1200;
                            const MAX_HEIGHT = 1200;
                            let width = img.width;
                            let height = img.height;

                            if (width > height) {
                                if (width > MAX_WIDTH) {
                                    height *= MAX_WIDTH / width;
                                    width = MAX_WIDTH;
                                }
                            } else {
                                if (height > MAX_HEIGHT) {
                                    width *= MAX_HEIGHT / height;
                                    height = MAX_HEIGHT;
                                }
                            }
                            canvas.width = width;
                            canvas.height = height;
                            ctx?.drawImage(img, 0, 0, width, height);

                            const dataUrl = canvas.toDataURL('image/png');
                            resolve(dataUrl);
                        } catch (err) {
                            reject(err);
                        } finally {
                            URL.revokeObjectURL(url);
                        }
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(url);
                        reject(new Error("Failed to load image"));
                    };
                    img.src = url;
                });
            };

            const insertImage = async (blob: File | Blob) => {
                try {
                    const optimizedParams = await optimizeImage(blob);
                    view.dispatch(view.state.tr.replaceSelectionWith(
                        view.state.schema.nodes.image.create({ src: optimizedParams })
                    ));
                } catch (error) {
                    console.warn("Image optimization failed:", error);
                    const reader = new FileReader();
                    reader.onload = () => {
                        if (typeof reader.result === 'string') {
                            view.dispatch(view.state.tr.replaceSelectionWith(
                                view.state.schema.nodes.image.create({ src: reader.result })
                            ));
                        }
                    };
                    reader.readAsDataURL(blob);
                }
            };

            // 1. Files
            if (clipboardData.files && clipboardData.files.length > 0) {
                const file = clipboardData.files[0];
                if (file.type.startsWith('image/')) {
                    event.preventDefault();
                    insertImage(file);
                    return true;
                }
            }

            // 2. Items
            const items = clipboardData.items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    const blob = items[i].getAsFile();
                    if (blob) {
                        event.preventDefault();
                        insertImage(blob);
                        return true;
                    }
                }
            }

            // 3. Fallback: Check HTML Image
            const html = clipboardData.getData('text/html');
            if (html && !clipboardData.getData('text/plain')) { // Only prioritize image if mostly image
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const img = doc.querySelector('img');
                if (img && img.src && !doc.querySelector('p')) { // Simple check
                    event.preventDefault();
                    fetch(img.src)
                        .then(res => res.blob())
                        .then(insertImage)
                        .catch(() => {
                            view.dispatch(view.state.tr.replaceSelectionWith(
                                view.state.schema.nodes.image.create({ src: img.src })
                            ));
                        });
                    return true;
                }
            }

            // 4. Smart Text Paste (Ctrl+V)
            const text = clipboardData.getData('text/plain');
            if (text || html) {
                processSmartPaste(editor, { text, html });
                return true; // We handled it
            }

            return false;
        };

        editor.setOptions({
            editorProps: {
                handlePaste: handlePasteHandler
            }
        });



    }, [editor]);


    // Content Sync Logic
    const previousNoteIdRef = useRef<string | null>(null);
    const [localTitle, setLocalTitle] = useState('');

    useEffect(() => {
        if (!editor || !activeNote) return;
        if (activeNote.id !== previousNoteIdRef.current) {
            setLocalTitle(activeNote.title);
            editor.commands.setContent(activeNote.content, { emitUpdate: false });
            previousNoteIdRef.current = activeNote.id;
        }
    }, [activeNote, editor]);


    // Formatting Helpers
    const toggleFormat = (type: string) => {
        if (!editor) return;
        editor.chain().focus();
        switch (type) {
            case 'bold': editor.chain().focus().toggleBold().run(); break;
            case 'italic': editor.chain().focus().toggleItalic().run(); break;
            case 'h1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break;
            case 'h2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break;
            case 'h3': editor.chain().focus().toggleHeading({ level: 3 }).run(); break;
            case 'paragraph': editor.chain().focus().setParagraph().run(); break; // New Body action
            case 'bullet': editor.chain().focus().toggleBulletList().run(); break;
            case 'task': editor.chain().focus().toggleTaskList().run(); break;
            case 'code': editor.chain().focus().toggleCodeBlock().run(); break;
        }
    };

    // --- CRUD ---
    const createNote = async () => {
        const targetFolder = activeFolderId === 'all' ? 'ninai' : activeFolderId;
        const newId = Date.now().toString();
        const newNote: Note = {
            id: newId,
            folderId: targetFolder,
            title: '',
            content: '', // Empty HTML
            updatedAt: new Date()
        };
        await db.notes.add(newNote);
        setActiveNoteId(newId);
    };

    const folderInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isCreatingFolder && folderInputRef.current) {
            folderInputRef.current.focus();
        }
    }, [isCreatingFolder]);

    const createFolder = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!showFolders) setShowFolders(true); // Ensure sidebar is visible
        setIsCreatingFolder(true);
    };

    const confirmCreateFolder = async () => {
        if (newFolderName.trim()) {
            const newId = Date.now().toString();
            await db.folders.add({
                id: newId,
                name: newFolderName,
                icon: 'Folder'
            });
            setActiveFolderId(newId);
            setNewFolderName('');
            setIsCreatingFolder(false);
        } else {
            setIsCreatingFolder(false);
        }
    };

    const deleteNote = async (noteId?: string) => {
        const idToDelete = noteId || activeNoteId;
        if (!idToDelete) return;
        await db.notes.delete(idToDelete);
        if (activeNoteId === idToDelete) setActiveNoteId(null);
    };

    const deleteFolder = async (id: string) => {
        if (id === 'all' || id === 'ninai') {
            alert("Cannot delete default folders.");
            return;
        }
        if (confirm('Delete this folder and its notes?')) {
            await db.folders.delete(id);
            await db.notes.where('folderId').equals(id).delete();
            if (activeFolderId === id) setActiveFolderId('ninai');
        }
    };

    const downloadMarkdown = () => {
        if (!activeNote || !editor) return;
        const title = activeNote.title || 'Untitled Note';
        const markdownContent = (editor.storage as any).markdown.getMarkdown();

        const element = document.createElement("a");
        const file = new Blob([`# ${title}\n\n${markdownContent}`], { type: 'text/markdown' });
        element.href = URL.createObjectURL(file);
        element.download = `${title.replace(/\s+/g, '_')}.md`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const [noteMenu, setNoteMenu] = useState<{ x: number, y: number, noteId: string } | null>(null);

    useEffect(() => {
        const closeMenu = () => { setNoteMenu(null); };
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, []);

    const handleNoteContextMenu = React.useCallback((e: React.MouseEvent, noteId: string) => {
        e.preventDefault();
        setNoteMenu({ x: e.clientX, y: e.clientY, noteId });
    }, []);

    const [moveTarget, setMoveTarget] = useState<{ type: 'note' | 'folder', id: string } | null>(null);
    const [editingFolderId, setEditingFolderId] = useState<string | null>(null);

    const handleMoveFolder = async (activeId: string, overId: string) => {
        const active = folders.find(f => f.id === activeId);
        const over = folders.find(f => f.id === overId);
        if (active && over && active.parentId === over.parentId) {
            const tempOrder = active.order;
            await db.folders.update(activeId, { order: over.order });
            await db.folders.update(overId, { order: tempOrder });
        }
    };

    const handleMoveItem = async (targetId: string) => {
        if (!moveTarget) return;

        if (moveTarget.type === 'note') {
            await db.notes.update(moveTarget.id, { folderId: targetId });
        } else {
            let current = folders.find(f => f.id === targetId);
            let invalid = false;
            while (current) {
                if (current.id === moveTarget.id) {
                    invalid = true;
                    break;
                }
                if (!current.parentId) break;
                current = folders.find(f => f.id === current?.parentId);
            }

            if (invalid) {
                alert("Cannot move a folder into its own subfolder.");
                return;
            }
            if (targetId === moveTarget.id) return;

            await db.folders.update(moveTarget.id, { parentId: targetId === 'root' ? undefined : targetId });
        }
        setMoveTarget(null);
    };

    const folderOptions = React.useMemo(() => {
        const list: { id: string, name: string, depth: number }[] = [];
        const traverse = (pid: string | undefined, depth: number) => {
            const children = folders.filter(f => (f.parentId || 'root') === (pid || 'root')).sort((a, b) => (a.order || 0) - (b.order || 0));
            children.forEach(f => {
                if (f.id !== 'all') {
                    list.push({ id: f.id, name: f.name, depth });
                    traverse(f.id, depth + 1);
                }
            });
        };
        traverse(undefined, 0);
        return list;
    }, [folders]);


    const noteCounts = React.useMemo(() => {
        const counts: { [key: string]: number } = {};
        counts['all'] = notes.length;
        folders.forEach(f => {
            if (f.id === 'all') return;
            counts[f.id] = notes.filter(n => n.folderId === f.id).length;
        });
        return counts;
    }, [notes, folders]);

    return (
        <div className="notes-panel" ref={panelRef}>
            {/* 1. Folders Sidebar */}
            <div
                className={`folders-sidebar ${!showFolders ? 'collapsed' : ''}`}
                style={{ width: showFolders ? folderWidth : undefined }}
            >
                <header className="notes-header-minimal">
                    <span className="folder-title-display">Folders</span>
                    <button className="icon-btn-ghost" onClick={createFolder} title="New Folder">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            <line x1="12" y1="11" x2="12" y2="17"></line>
                            <line x1="9" y1="14" x2="15" y2="14"></line>
                        </svg>
                    </button>
                </header>

                <div className="folders-list-container">
                    {isCreatingFolder && (
                        <div className="folder-item active" style={{ cursor: 'default', margin: '0 12px' }}>
                            <span className="folder-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                            </span>
                            <input
                                ref={folderInputRef}
                                autoFocus
                                className="folder-input-inline"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') confirmCreateFolder();
                                    if (e.key === 'Escape') setIsCreatingFolder(false);
                                }}
                                placeholder="Name..."
                            />
                        </div>
                    )}

                    {searchTerm && <div className="section-label">Results</div>}

                    <FolderList
                        folders={filteredFolders}
                        activeFolderId={activeFolderId}
                        onSelectFolder={setActiveFolderId}
                        onRenameFolder={async (id, name) => {
                            await db.folders.update(id, { name });
                        }}
                        onDeleteFolder={deleteFolder}
                        onMoveFolder={handleMoveFolder}
                        onCreateSubfolder={async (parentId) => {
                            const newId = Date.now().toString();
                            await db.folders.add({
                                id: newId,
                                name: 'New Subfolder',
                                parentId: parentId,
                                order: 999,
                                icon: 'Folder'
                            });
                            setActiveFolderId(newId);
                        }}
                        onRequestMove={(folderId) => setMoveTarget({ type: 'folder', id: folderId })}
                        noteCounts={noteCounts}
                        editingFolderId={editingFolderId}
                        setEditingFolderId={setEditingFolderId}
                    />
                </div>

                {zenMode ? (
                    <button className="column-toggle-collapsed" onClick={onToggleZenMode}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 5l7 7-7 7" /><path d="M5 5l7 7-7 7" /></svg>
                    </button>
                ) : (
                    <button className="column-toggle" onClick={onToggleZenMode}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 19l-7-7 7-7" /><path d="M19 19l-7-7 7-7" /></svg>
                    </button>
                )}

                {showFolders && <div className="panel-resizer" onMouseDown={startResizing('folder')} />}
            </div>

            {/* 2. Notes List */}
            <div
                className={`notes-list-col ${!showList ? 'collapsed' : ''} ${!showEditor ? 'expanded' : ''}`}
                style={{ width: showList && showEditor ? listWidth : undefined }}
            >
                {showList && (
                    <>
                        <header className="notes-header-minimal">
                            <span className="folder-title-display">{folders.find(f => f.id === activeFolderId)?.name || 'All Notes'}</span>
                            <button className="icon-btn-primary" onClick={createNote} title="New Note">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                        </header>
                        <div style={{ padding: '0 8px 12px' }}>
                            <div className="search-wrapper">
                                <span className="search-icon">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                </span>
                                <input
                                    className="notes-search-bar"
                                    placeholder="Search"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </>
                )}
                {showList && (
                    <div className="notes-scroller">
                        {(() => {
                            const now = new Date();
                            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                            const yesterday = new Date(today);
                            yesterday.setDate(yesterday.getDate() - 1);
                            const last7Days = new Date(today);
                            last7Days.setDate(last7Days.getDate() - 7);
                            const last30Days = new Date(today);
                            last30Days.setDate(last30Days.getDate() - 30);

                            const groups: { [key: string]: typeof displayNotes } = {};
                            const groupOrder: string[] = [];

                            displayNotes.forEach(note => {
                                const noteDate = new Date(note.updatedAt);
                                const dateOnly = new Date(noteDate.getFullYear(), noteDate.getMonth(), noteDate.getDate());

                                let groupName = '';
                                if (dateOnly.getTime() === today.getTime()) {
                                    groupName = 'Today';
                                } else if (dateOnly.getTime() === yesterday.getTime()) {
                                    groupName = 'Yesterday';
                                } else if (dateOnly > last7Days) {
                                    groupName = 'Previous 7 Days';
                                } else if (dateOnly > last30Days) {
                                    groupName = 'Previous 30 Days';
                                } else {
                                    groupName = noteDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                                }

                                if (!groups[groupName]) {
                                    groups[groupName] = [];
                                    groupOrder.push(groupName);
                                }
                                groups[groupName].push(note);
                            });

                            if (displayNotes.length === 0) {
                                return (
                                    <div className="empty-state" style={{ padding: '40px 20px', textAlign: 'center', opacity: 0.5 }}>
                                        No notes found
                                    </div>
                                );
                            }

                            return groupOrder.map(group => (
                                <div key={group} className="notes-group">
                                    <h5 className="notes-group-header">{group}</h5>
                                    {groups[group].map(note => (
                                        <NotePreviewCard
                                            key={note.id}
                                            note={note}
                                            isActive={activeNoteId === note.id}
                                            onSelect={handleNoteClick}
                                            onContextMenu={handleNoteContextMenu}
                                        />
                                    ))}
                                </div>
                            ));
                        })()}
                    </div>
                )}
                {noteMenu && (
                    <>
                        <div className="context-menu-backdrop" onClick={() => setNoteMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                        <div className="context-menu" style={{ top: noteMenu.y, left: noteMenu.x, zIndex: 100 }}>
                            <button onClick={() => { setMoveTarget({ type: 'note', id: noteMenu.noteId }); setNoteMenu(null); }} className="menu-item">Move to...</button>
                            <div className="menu-divider" />
                            <button onClick={() => deleteNote(noteMenu.noteId)} className="menu-item delete">Delete Note</button>
                        </div>
                    </>
                )}

                {showList && showEditor && <div className="panel-resizer" onMouseDown={startResizing('list')} />}
            </div>

            {/* 3. Editor Stage */}
            {showEditor && (
                <div
                    className={`editor-stage ${isCreatingFolder ? 'blur-sm' : ''}`}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add('drag-over-active');
                    }}
                    onDragLeave={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('drag-over-active');
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.classList.remove('drag-over-active');
                        if (!editor) return;
                        const html = e.dataTransfer.getData('text/html');
                        const text = e.dataTransfer.getData('text/plain');
                        if (html || text) {
                            processSmartPaste(editor, { text, html });
                        }
                    }}
                >
                    {activeNote ? (
                        <>
                            <div className="editor-toolbar-clean">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    {(!showFolders || !showList) && (
                                        <button
                                            className="icon-btn-ghost"
                                            onClick={() => { setShowFolders(true); setShowList(true); }}
                                            title="Show Sidebars"
                                            style={{ marginLeft: '-8px' }}
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                                <line x1="9" y1="3" x2="9" y2="21"></line>
                                            </svg>
                                        </button>
                                    )}
                                    <ExportButton editor={editor} />
                                    <ImportButton editor={editor} onImportFromWebview={onImportFromWebview} />
                                    <div style={{ width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 4px' }}></div>
                                    <button
                                        className="icon-btn-primary"
                                        onClick={async () => {
                                            if (!activeNote || !editor) return;
                                            const title = activeNote.title || 'Untitled';
                                            const html = editor.getHTML();
                                            try {
                                                // @ts-expect-error Electron API
                                                if (window.electronAPI && window.electronAPI.printToPDF) {
                                                    // @ts-expect-error Electron API
                                                    await window.electronAPI.printToPDF(title, html);
                                                } else {
                                                    alert("PDF Export is only available in the Desktop app.");
                                                }
                                            } catch (e) {
                                                console.error("PDF Export failed", e);
                                                alert("Failed to export PDF.");
                                            }
                                        }}
                                        title="Export as PDF"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                            <polyline points="14 2 14 8 20 8"></polyline>
                                            <line x1="16" y1="13" x2="8" y2="13"></line>
                                            <line x1="16" y1="17" x2="8" y2="17"></line>
                                            <polyline points="10 9 9 9 8 9"></polyline>
                                        </svg>
                                    </button>

                                    <button
                                        className={`icon-btn-primary ${isFullScreen ? 'active' : ''}`}
                                        onClick={toggleFullScreen}
                                        title={isFullScreen ? "Exit Focus Mode" : "Focus Mode (Hide Sidebar)"}
                                    >
                                        {isFullScreen ?
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
                                            :
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                                        }
                                    </button>

                                    <button
                                        className={`icon-btn-primary ${zenMode ? 'active' : ''}`}
                                        onClick={onToggleZenMode}
                                        title={zenMode ? "Show Browser" : "Zen Mode (Hide Browser)"}
                                    >
                                        {zenMode ?
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                                            :
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
                                        }
                                    </button>

                                    <div className="toolbar-divider" style={{ height: '16px', margin: '0' }} />

                                    <button
                                        className="icon-btn-ghost"
                                        onClick={() => deleteNote(activeNote?.id)}
                                        title="Delete Note"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                    <button className="action-link" onClick={downloadMarkdown}>Export</button>
                                </div>
                            </div>

                            <div className="editor-canvas">
                                <input
                                    className="clean-title-input"
                                    value={localTitle}
                                    onChange={(e) => {
                                        setLocalTitle(e.target.value);
                                        updateNote('title', e.target.value);
                                    }}
                                    placeholder="Title"
                                />

                                <div className="formatting-toolbar">
                                    <button onClick={() => toggleFormat('h1')} className={editor?.isActive('heading', { level: 1 }) ? 'active' : ''} title="Heading 1" style={{ fontSize: '13px', fontWeight: 600 }}>H1</button>
                                    <button onClick={() => toggleFormat('h2')} className={editor?.isActive('heading', { level: 2 }) ? 'active' : ''} title="Heading 2" style={{ fontSize: '13px', fontWeight: 600 }}>H2</button>
                                    <button onClick={() => toggleFormat('h3')} className={editor?.isActive('heading', { level: 3 }) ? 'active' : ''} title="Heading 3" style={{ fontSize: '13px', fontWeight: 600 }}>H3</button>
                                    <button onClick={() => toggleFormat('paragraph')} className={editor?.isActive('paragraph') ? 'active' : ''} title="Body Text" style={{ fontSize: '13px', fontWeight: 500 }}>Body</button>
                                    <div className="toolbar-divider" />
                                    <button onClick={() => toggleFormat('bold')} className={editor?.isActive('bold') ? 'active' : ''} title="Bold">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg>
                                    </button>
                                    <button onClick={() => toggleFormat('italic')} className={editor?.isActive('italic') ? 'active' : ''} title="Italic">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg>
                                    </button>
                                    <div className="toolbar-divider" />
                                    <button onClick={() => toggleFormat('bullet')} className={editor?.isActive('bulletList') ? 'active' : ''} title="Bullet List">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                                    </button>
                                    <button onClick={() => toggleFormat('task')} className={editor?.isActive('taskList') ? 'active' : ''} title="Checklist (TickBox)">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                                    </button>
                                    <div className="toolbar-divider" />
                                    <button
                                        onClick={() => toggleFormat('code')}
                                        className={editor?.isActive('codeBlock') ? 'active' : ''}
                                        title="Code Block"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                                    </button>
                                </div>

                                <div className="editor-content-area">
                                    <EditorContent editor={editor} />
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="empty-stage">
                            <div className="empty-icon">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                    <polyline points="10 9 9 9 8 9" />
                                </svg>
                            </div>
                            <p>Select a note to start writing</p>
                        </div>
                    )}
                </div>
            )}

            {!showEditor && (
                <div className="editor-collapsed-handle">
                    <button className="column-toggle-collapsed" onClick={() => setShowEditor(true)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                    </button>
                </div>
            )}

            {moveTarget && (
                <div className="modal-backdrop" onClick={() => setMoveTarget(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Move {moveTarget.type === 'note' ? 'Note' : 'Folder'}</h3>
                        </div>
                        <div className="folder-select-list">
                            <button
                                className={`folder-select-item ${activeFolderId === 'ninai' ? 'active' : ''}`}
                                onClick={() => handleMoveItem('ninai')}
                            >
                                <span className="folder-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                                </span> Home (NINAI)
                            </button>
                            {folderOptions.map(f => (
                                <button
                                    key={f.id}
                                    className="folder-select-item"
                                    style={{ paddingLeft: `${f.depth * 20 + 12}px` }}
                                    onClick={() => handleMoveItem(f.id)}
                                    disabled={moveTarget.type === 'folder' && moveTarget.id === f.id}
                                >
                                    {f.depth > 0 ? '' : ''}<span className="folder-icon">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                                    </span> {f.name}
                                </button>
                            ))}
                            <div className="modal-actions">
                                <button className="close-btn" onClick={() => setMoveTarget(null)}>Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Helper for Smart Paste Logic (Reuse for Clipboard + Drop)
const processSmartPaste = (editor: any, content: { text: string, html: string }) => {
    // console.log("Smart Paste: RAW", content);
    if ((!content.text || content.text.trim() === '') && (!content.html || content.html.trim() === '')) return;

    // HELPER: Recursive Decoder
    const decode = (str: string) => {
        if (!str) return '';
        let decoded = str;
        let loop = 0;
        let previous = '';
        while (decoded !== previous && loop < 5) {
            previous = decoded;
            decoded = decoded
                .replace(/&lt;/gi, '<')
                .replace(/&gt;/gi, '>')
                .replace(/&amp;/gi, '&')
                .replace(/&quot;/gi, '"')
                .replace(/&#39;/g, "'")
                .replace(/&#x27;/g, "'")
                .replace(/&#60;/g, '<')
                .replace(/&#62;/g, '>')
                .replace(/&nbsp;/gi, ' ');
            loop++;
        }
        return decoded;
    };

    let candidate = '';
    // 1. Try HTML source first
    if (content.html && content.html.trim().length > 0) {
        let dec = decode(content.html);
        if (dec && dec.trim().length > 0) candidate = dec;
    }
    // 2. Fallback to Text
    if (!candidate && content.text) {
        candidate = decode(content.text);
    }

    // HELPER: Normalize ChatGPT Style Unicode Checkboxes
    if (candidate) {
        candidate = candidate
            // Convert Box characters (U+2610, U+2611, U+2612) to Markdown Checkboxes
            .replace(/[\u2610\u2611\u2612]/g, (m) => m === '\u2610' ? '- [ ] ' : '- [x] ')
            // Fix formatting: "☐\nTask" -> "- [ ] Task" (Collapse newline)
            .replace(/- \[( |x)\]\s*\n\s*/g, '- [$1] ');
    }

    if (!candidate) return;

    // Check for HTML tags (strict start or block tags)
    const hasBlockTags = /<(p|div|ul|ol|li|h[1-6]|table|blockquote|pre|code|span|strong|em|br|img)/i.test(candidate);
    const startsWithTag = /^<[a-z!]/i.test(candidate.trim());

    if (hasBlockTags || startsWithTag) {
        console.log("Smart Paste: Detected HTML -> Parse via ProseMirror DOMParser");
        try {
            // PROSEMIRROR PARSE: This converts HTML directly to Nodes, resolving ambiguity
            const element = document.createElement('div');
            element.innerHTML = candidate;

            // Use Tiptap's schema to parse the DOM element into a ProseMirror Slice
            const slice = ProseMirrorDOMParser.fromSchema(editor.schema).parseSlice(element);

            // Insert the content (Fragment) directly
            editor.chain().focus().insertContent(slice.content).run();
        } catch (e) {
            console.error("ProseMirror Parse Failed:", e);
            // Fallback
            editor.chain().focus().insertContent(candidate).run();
        }
    } else {
        console.log("Smart Paste: Treated as Markdown/Text -> Parse via Tiptap Markdown");
        try {
            // Use Tiptap's internal parser for 100% Schema fidelity (TaskLists etc.)
            const parser = editor.storage.markdown?.parser;
            if (parser) {
                // Tiptap Markdown parser returns a ProseMirror Node (Document)
                const parsed = parser.parse(candidate);
                // Insert the content of the parsed document
                editor.chain().focus().insertContent(parsed).run();
            } else {
                insertMarkdown(editor, candidate);
            }
        } catch (e) {
            console.warn("Smart Paste: Markdown parse error, fallback to marked:", e);
            insertMarkdown(editor, candidate);
        }
    }
};

// Internal Component for ImportButton
const ImportButton = ({ editor, onImportFromWebview }: { editor: any, onImportFromWebview?: () => Promise<{ text: string, html: string } | null> }) => {
    const [status, setStatus] = useState<'idle' | 'pasted' | 'dropping'>('idle');

    const handleImport = async () => {
        // console.log('Import button clicked');
        if (!editor) return;

        try {
            let content = { text: '', html: '' };
            let importedFromWebview = false;

            // 1. Try to get content from Active Webview first (if available)
            if (onImportFromWebview) {
                console.log("Attempting to import from webview...");
                const webviewContent = await onImportFromWebview();
                if (webviewContent && (webviewContent.text || webviewContent.html)) {
                    // console.log("Imported from webview:", { textLen: webviewContent.text?.length });
                    content = webviewContent;
                    importedFromWebview = true;
                }
            }

            // 2. Fallback to Clipboard if no webview content
            if (!importedFromWebview) {
                // @ts-ignore
                if (window.electronAPI?.clipboard?.readExtended) {
                    // @ts-ignore
                    const data = await window.electronAPI.clipboard.readExtended();
                    content = { text: data.text, html: data.html };
                } else {
                    const t = await navigator.clipboard.readText();
                    content = { text: t, html: '' };
                }
            }

            processSmartPaste(editor, content);

            setStatus('pasted');
            setTimeout(() => setStatus('idle'), 2000);
        } catch (err) {
            console.error('Failed to import:', err);
            alert(`Failed to import: ${err}`);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setStatus('idle');

        if (!editor) return;

        const html = e.dataTransfer.getData('text/html');
        const text = e.dataTransfer.getData('text/plain');

        // console.log('Dropped content:', { textLen: text?.length, htmlLen: html?.length });

        processSmartPaste(editor, { text, html });
        setStatus('pasted');
        setTimeout(() => setStatus('idle'), 2000);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setStatus('dropping');
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setStatus('idle');
    };

    return (
        <button
            className={`icon-btn-ghost ${status === 'dropping' ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}
            onClick={handleImport}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            title="Paste from LLM (Click or Drop Text Here)"
            style={{
                color: status === 'pasted' ? '#10b981' : (status === 'dropping' ? '#3b82f6' : '#3b82f6'),
                transition: 'all 0.2s',
                transform: status === 'dropping' ? 'scale(1.2)' : 'scale(1)'
            }}
        >
            {status === 'pasted' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="8 12 12 16 16 12"></polyline>
                    <line x1="12" y1="8" x2="12" y2="16"></line>
                </svg>
            )}
        </button>
    );
};
