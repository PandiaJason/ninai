import React, { useEffect, useRef, useState } from 'react';
import { exportBackup } from '../utils/export';
import { db } from '../db';
import type { ModuleId } from '../types/workspace';
import { Icon, type IconName } from './ui/Icon';
import './Sidebar.css';

interface SidebarProps {
    tools: any[];
    activeToolId: string;
    onSelectTool: (id: string) => void;
    onAddTool: (name: string, url: string) => void;
    onDeleteTool: (id: string) => void;
    activeModule?: ModuleId;
    onSelectModule?: (module: ModuleId) => void;
    onOpenSearch?: () => void;
    workspaceName?: string;
    onSignOut?: () => void;
}

const PRIMARY_MODULES: { id: ModuleId; label: string; icon: IconName }[] = [
    { id: 'today', label: 'Today', icon: 'dashboard' },
    { id: 'crm', label: 'Learners', icon: 'users' },
    { id: 'analytics', label: 'Insights', icon: 'chart' },
];

const MORE_MODULES: { id: ModuleId; label: string; icon: IconName }[] = [
    { id: 'dashboard', label: 'Overview', icon: 'grid' },
    { id: 'projects', label: 'Projects', icon: 'projects' },
    { id: 'followups', label: 'Follow-ups', icon: 'followups' },
    { id: 'tasks', label: 'Tasks', icon: 'tasks' },
    { id: 'notes', label: 'Notes', icon: 'notes' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
    { id: 'tools', label: 'Browser', icon: 'globe' },
];

export const Sidebar: React.FC<SidebarProps> = ({
    tools,
    activeToolId,
    onSelectTool,
    onAddTool,
    onDeleteTool,
    activeModule = 'today',
    onSelectModule,
    onOpenSearch,
    workspaceName,
    onSignOut,
}) => {
    // --- User Profile State ---
    const [userName, setUserName] = useState(() => localStorage.getItem('ninai_username') || 'N');
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);
    const moreRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        localStorage.setItem('ninai_username', userName);
    }, [userName]);

    const userInitial = (Array.from(userName)[0] || 'N').toUpperCase();
    const workspaceInitials = (workspaceName || '')
        .split(/\s+/)
        .filter(Boolean)
        .map(part => Array.from(part)[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

    // --- Tool Management State ---
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, toolId: string } | null>(null);

    useEffect(() => {
        const closeMenu = () => setContextMenu(null);
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, []);

    useEffect(() => {
        if (!showProfileMenu && !showMore) return;
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (showProfileMenu && !profileRef.current?.contains(target)) setShowProfileMenu(false);
            if (showMore && !moreRef.current?.contains(target)) setShowMore(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setShowProfileMenu(false);
            setShowMore(false);
            setIsAdding(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [showProfileMenu, showMore]);

    const handleContextMenu = (e: React.MouseEvent, toolId: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, toolId });
    };

    const handleDelete = (id: string) => {
        if (confirm('Delete this site?')) {
            onDeleteTool(id);
        }
    };

    const handleAddSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (newName && newUrl) {
            onAddTool(newName, newUrl);
            setIsAdding(false);
            setNewName('');
            setNewUrl('');
        }
    };

    const handleFactoryReset = async () => {
        if (confirm("⚠️ FACTORY RESET ⚠️\n\nThis will permanently DELETE ALL your notes and folders.\nAre you sure you want to wipe everything and start over?")) {
            try {
                db.close();
                await db.delete();
                localStorage.clear();
                localStorage.setItem('ninai_setup_complete', 'false');
                alert('Reset Complete. The app will now reload.');
                window.location.reload();
            } catch (e) {
                alert('Reset failed: ' + e);
                window.location.reload();
            }
        }
    };

    const selectModule = (module: ModuleId) => {
        setShowMore(false);
        setShowProfileMenu(false);
        setIsAdding(false);
        onSelectModule?.(module);
    };

    const selectTool = (id: string) => {
        setShowMore(false);
        setShowProfileMenu(false);
        setIsAdding(false);
        onSelectTool(id);
    };

    const moreIsActive = activeModule === 'tools' || MORE_MODULES.some(module => module.id === activeModule);

    return (
        <nav className="sidebar-nav">
            {/* User profile */}
            <div className="sidebar-profile" ref={profileRef}>
                <button
                    className="sidebar-logo interactive"
                    onClick={() => {
                        setShowMore(false);
                        setShowProfileMenu(value => !value);
                    }}
                    title="User settings"
                    aria-label="User settings"
                    aria-haspopup="menu"
                    aria-expanded={showProfileMenu}
                >
                    <span className="logo-text">{userInitial}</span>
                </button>

                {showProfileMenu && (
                    <div className="add-tool-popover profile-menu" role="menu" aria-label="User settings">
                        <h3 style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>User Profile</h3>
                        <div className="profile-form">
                            <label>Name (sets Avatar)</label>
                            <input
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                placeholder="Your Name"
                                maxLength={20}
                            />
                            <div className="divider" />
                            <button
                                className="primary"
                                onClick={exportBackup}
                                style={{
                                    marginTop: '12px',
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    background: 'var(--accent-primary)',
                                    color: '#fff',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 500,
                                }}
                            >
                                <Icon name="download" size={16} /> Backup Data
                            </button>

                            <div className="divider" />

                            {onSignOut && (
                                <button
                                    className="menu-item"
                                    onClick={() => {
                                        setShowProfileMenu(false);
                                        onSignOut();
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        fontSize: '0.9rem',
                                        color: 'var(--text-secondary)',
                                        background: 'var(--surface-mid)',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                    }}
                                >
                                    <Icon name="logout" size={16} /> Sign out
                                </button>
                            )}

                            <button
                                className="menu-item delete"
                                onClick={handleFactoryReset}
                                style={{
                                    width: '100%',
                                    marginTop: '4px',
                                    padding: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    fontSize: '0.9rem',
                                    color: 'var(--accent-danger)',
                                    background: 'rgba(255, 0, 0, 0.05)',
                                    border: '1px solid rgba(255, 0, 0, 0.1)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                }}
                            >
                                ⚠️ Factory Reset
                            </button>
                        </div>
                        <button className="close-link" onClick={() => setShowProfileMenu(false)}>Close</button>
                    </div>
                )}
            </div>

            <div className="sidebar-scroll">
                {workspaceName && workspaceInitials && (
                    <div className="sidebar-workspace-chip" title={workspaceName} aria-label={workspaceName}>{workspaceInitials}</div>
                )}

                <div className="sidebar-modules" aria-label="Primary navigation">
                    {PRIMARY_MODULES.map(module => (
                        <button
                            key={module.id}
                            className={`nav-module-btn ${activeModule === module.id ? 'active' : ''}`}
                            onClick={() => selectModule(module.id)}
                            aria-label={module.label}
                            aria-current={activeModule === module.id ? 'page' : undefined}
                        >
                            <Icon name={module.icon} size={19} />
                            <span className="nav-module-tooltip">{module.label}</span>
                        </button>
                    ))}

                    <div className="sidebar-more-wrap" ref={moreRef}>
                        <button
                            className={`nav-module-btn ${moreIsActive || showMore ? 'active' : ''}`}
                            onClick={() => {
                                setShowProfileMenu(false);
                                setShowMore(value => !value);
                            }}
                            aria-label="More"
                            aria-haspopup="menu"
                            aria-expanded={showMore}
                            aria-current={moreIsActive ? 'page' : undefined}
                        >
                            <Icon name="more" size={19} />
                            <span className="nav-module-tooltip">More</span>
                        </button>

                        {showMore && (
                            <div className="sidebar-more-panel" role="menu" aria-label="More">
                                <button type="button" role="menuitem" className="sidebar-more-item" onClick={() => {
                                    setShowMore(false);
                                    onOpenSearch?.();
                                }}>
                                    <Icon name="search" size={16} />
                                    <span>Search workspace</span>
                                    <kbd className="sidebar-more-kbd">⌘K</kbd>
                                </button>

                                <div className="sidebar-more-label">Workspace</div>
                                {MORE_MODULES.map(module => (
                                    <button
                                        key={module.id}
                                        type="button"
                                        role="menuitem"
                                        className={`sidebar-more-item ${activeModule === module.id ? 'active' : ''}`}
                                        onClick={() => selectModule(module.id)}
                                        aria-current={activeModule === module.id ? 'page' : undefined}
                                    >
                                        <Icon name={module.icon} size={16} />
                                        <span>{module.label}</span>
                                    </button>
                                ))}

                                <div className="sidebar-more-label">Sites</div>
                                {tools.map(tool => (
                                    <button
                                        key={tool.id}
                                        type="button"
                                        role="menuitem"
                                        className={`sidebar-more-item ${activeModule === 'tools' && activeToolId === tool.id ? 'active' : ''}`}
                                        onClick={() => selectTool(tool.id)}
                                        onContextMenu={(e) => handleContextMenu(e, tool.id)}
                                    >
                                        <span className="sidebar-more-site" style={{ color: tool.color }}>{tool.label}</span>
                                        <span>{tool.name}</span>
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="sidebar-more-item"
                                    onClick={() => setIsAdding(value => !value)}
                                >
                                    <Icon name="plus" size={16} />
                                    <span>Add a site</span>
                                </button>

                                {isAdding && (
                                    <form className="sidebar-more-form" onSubmit={handleAddSubmit}>
                                        <input
                                            autoFocus
                                            placeholder="Name (e.g. Perplexity)"
                                            value={newName}
                                            onChange={e => setNewName(e.target.value)}
                                            aria-label="Site name"
                                        />
                                        <input
                                            placeholder="URL (e.g. perplexity.ai)"
                                            value={newUrl}
                                            onChange={e => setNewUrl(e.target.value)}
                                            aria-label="Site URL"
                                        />
                                        <div className="sidebar-more-form-actions">
                                            <button type="button" onClick={() => setIsAdding(false)}>Cancel</button>
                                            <button type="submit" disabled={!newName || !newUrl} className="primary">Add</button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Simple context menu for deleting a custom site */}
            {contextMenu && (
                <div
                    className="context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button onClick={() => handleDelete(contextMenu.toolId)} className="menu-item delete">
                        Delete
                    </button>
                </div>
            )}

            <div className="sidebar-footer" />
        </nav>
    );
};
