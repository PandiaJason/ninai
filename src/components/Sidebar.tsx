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
    gmailPending?: number;
}

const PRIMARY_MODULES: { id: ModuleId; label: string; icon: IconName }[] = [
    { id: 'dashboard', label: 'Overview', icon: 'dashboard' },
    { id: 'founder', label: 'Founder Channel', icon: 'message' },
    { id: 'crm', label: 'Learners', icon: 'crm' },
    { id: 'institutions', label: 'Institutions', icon: 'building' },
    { id: 'projects', label: 'Projects', icon: 'projects' },
    { id: 'tasks', label: 'Tasks', icon: 'tasks' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
];

const SECONDARY_MODULES: { id: ModuleId; label: string; icon: IconName }[] = [
    { id: 'today', label: 'Today', icon: 'clock' },
    { id: 'followups', label: 'Follow-ups', icon: 'followups' },
    { id: 'gmail', label: 'Gmail', icon: 'mail' },
    { id: 'analytics', label: 'Insights', icon: 'chart' },
    { id: 'notes', label: 'Notes', icon: 'notes' },
];

interface SidebarItemProps {
    id: string;
    label: string;
    icon: IconName;
    active: boolean;
    onSelect: () => void;
    className?: string;
    badge?: number;
    children?: React.ReactNode;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ label, icon, active, onSelect, className = '', badge, children }) => (
    <button
        type="button"
        className={`sidebar-item ${active ? 'active' : ''} ${className}`}
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        title={label}
    >
        <span className="sidebar-item-icon">
            {children || <Icon name={icon} size={17} />}
        </span>
        <span className="sidebar-item-label">{label}</span>
        {badge !== undefined && badge > 0 && <span className="sidebar-item-badge">{badge > 99 ? '99+' : badge}</span>}
    </button>
);

export const Sidebar: React.FC<SidebarProps> = ({
    tools,
    activeToolId,
    onSelectTool,
    onAddTool,
    onDeleteTool,
    activeModule = 'dashboard',
    onSelectModule,
    onOpenSearch,
    workspaceName,
    onSignOut,
    gmailPending = 0,
}) => {
    const [userName, setUserName] = useState(() => localStorage.getItem('ninai_username') || 'N');
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; toolId: string } | null>(null);
    const profileRef = useRef<HTMLDivElement>(null);
    const addRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        localStorage.setItem('ninai_username', userName);
    }, [userName]);

    const userInitial = (Array.from(userName)[0] || 'N').toUpperCase();

    useEffect(() => {
        const closeMenu = () => setContextMenu(null);
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, []);

    useEffect(() => {
        if (!showProfileMenu && !isAdding) return;
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (showProfileMenu && !profileRef.current?.contains(target)) setShowProfileMenu(false);
            if (isAdding && !addRef.current?.contains(target)) setIsAdding(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setShowProfileMenu(false);
            setIsAdding(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [showProfileMenu, isAdding]);

    const handleContextMenu = (event: React.MouseEvent, toolId: string) => {
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY, toolId });
    };

    const handleDelete = (id: string) => {
        if (confirm('Remove this site from your tools?')) onDeleteTool(id);
        setContextMenu(null);
    };

    const handleAddSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!newName.trim() || !newUrl.trim()) return;
        onAddTool(newName.trim(), newUrl.trim());
        setIsAdding(false);
        setNewName('');
        setNewUrl('');
    };

    const handleFactoryReset = async () => {
        if (!confirm('Factory reset\n\nThis permanently deletes all your notes, folders and local workspace data. Continue?')) return;
        try {
            db.close();
            await db.delete();
            localStorage.clear();
            localStorage.setItem('ninai_setup_complete', 'false');
            alert('Reset complete. The app will now reload.');
            window.location.reload();
        } catch {
            alert('Reset failed. The app will now reload.');
            window.location.reload();
        }
    };

    const selectModule = (module: ModuleId) => {
        setShowProfileMenu(false);
        setIsAdding(false);
        onSelectModule?.(module);
    };

    const selectTool = (id: string) => {
        setShowProfileMenu(false);
        setIsAdding(false);
        onSelectTool(id);
    };

    const toolIsActive = (id: string) => activeModule === 'tools' && activeToolId === id;

    return (
        <nav className="sidebar-nav" aria-label="Main navigation">
            <div className="sidebar-brand" ref={profileRef}>
                <button
                    type="button"
                    className="sidebar-avatar"
                    onClick={() => {
                        setIsAdding(false);
                        setShowProfileMenu(value => !value);
                    }}
                    title="Account"
                    aria-label="Account"
                    aria-haspopup="menu"
                    aria-expanded={showProfileMenu}
                >
                    {userInitial}
                </button>
                <div className="sidebar-brand-copy">
                    <span className="sidebar-brand-name">NINAI</span>
                    <span className="sidebar-brand-workspace">{workspaceName || 'Workspace'}</span>
                </div>

                {showProfileMenu && (
                    <div className="sidebar-popover profile-menu" role="menu" aria-label="Account">
                        <header className="sidebar-popover-head">
                            <span className="sidebar-popover-avatar">{userInitial}</span>
                            <div>
                                <h3>{userName}</h3>
                                <p>{workspaceName || 'Workspace'}</p>
                            </div>
                        </header>
                        <div className="sidebar-field">
                            <label htmlFor="sidebar-user-name">Avatar initial</label>
                            <input
                                id="sidebar-user-name"
                                value={userName}
                                onChange={event => setUserName(event.target.value)}
                                placeholder="Your name"
                                maxLength={20}
                            />
                        </div>
                        <button type="button" className="sidebar-menu-button" onClick={exportBackup}>
                            <Icon name="download" size={15} />
                            Backup data
                        </button>
                        {onSignOut && (
                            <button
                                type="button"
                                className="sidebar-menu-button"
                                onClick={() => {
                                    setShowProfileMenu(false);
                                    onSignOut();
                                }}
                            >
                                <Icon name="logout" size={15} />
                                Sign out
                            </button>
                        )}
                        <div className="sidebar-popover-divider" />
                        <button type="button" className="sidebar-menu-button danger" onClick={() => void handleFactoryReset()}>
                            <Icon name="alert" size={15} />
                            Factory reset
                        </button>
                    </div>
                )}
            </div>

            <button type="button" className="sidebar-search" onClick={onOpenSearch} aria-label="Search workspace">
                <Icon name="search" size={16} />
                <span className="sidebar-search-label">Search</span>
                <kbd>⌘K</kbd>
            </button>

            <div className="sidebar-scroll">
                <div className="sidebar-section" aria-label="Workspace">
                    <div className="sidebar-section-label">Workspace</div>
                    {PRIMARY_MODULES.map(module => (
                        <SidebarItem
                            key={module.id}
                            id={module.id}
                            label={module.label}
                            icon={module.icon}
                            active={activeModule === module.id}
                            onSelect={() => selectModule(module.id)}
                        />
                    ))}
                </div>

                <div className="sidebar-section secondary" aria-label="More">
                    <div className="sidebar-section-label">More</div>
                    {SECONDARY_MODULES.map(module => (
                        <SidebarItem
                            key={module.id}
                            id={module.id}
                            label={module.label}
                            icon={module.icon}
                            active={activeModule === module.id}
                            onSelect={() => selectModule(module.id)}
                            badge={module.id === 'gmail' ? gmailPending : undefined}
                        />
                    ))}
                </div>

                <div className="sidebar-section tools" aria-label="Tools">
                    <div className="sidebar-section-head">
                        <span className="sidebar-section-label">Tools</span>
                        <button
                            type="button"
                            className="sidebar-add-tool"
                            onClick={() => {
                                setShowProfileMenu(false);
                                setIsAdding(value => !value);
                            }}
                            title="Add a site"
                            aria-label="Add a site"
                            aria-haspopup="dialog"
                            aria-expanded={isAdding}
                        >
                            <Icon name="plus" size={14} />
                        </button>
                    </div>
                    {tools.map(tool => (
                        <SidebarItem
                            key={tool.id}
                            id={tool.id}
                            label={tool.name}
                            icon="globe"
                            active={toolIsActive(tool.id)}
                            onSelect={() => selectTool(tool.id)}
                            className="sidebar-tool"
                        >
                            <span
                                className="sidebar-tool-mark"
                                style={{ color: tool.color, borderColor: `${tool.color}33`, background: `${tool.color}12` }}
                                onContextMenu={event => handleContextMenu(event, tool.id)}
                                title={`${tool.name} · right-click to remove`}
                            >
                                {tool.label}
                            </span>
                        </SidebarItem>
                    ))}
                    <button
                        type="button"
                        className="sidebar-item sidebar-add-site"
                        onClick={() => {
                            setShowProfileMenu(false);
                            setIsAdding(value => !value);
                        }}
                    >
                        <span className="sidebar-item-icon"><Icon name="plus" size={17} /></span>
                        <span className="sidebar-item-label">Add site</span>
                    </button>
                </div>
            </div>

            {isAdding && (
                <div className="sidebar-popover sidebar-add-popover" ref={addRef} role="dialog" aria-label="Add a site">
                    <h3>Add a site</h3>
                    <p>Keep the tools you use beside your CRM.</p>
                    <form onSubmit={handleAddSubmit}>
                        <label>
                            Name
                            <input
                                autoFocus
                                placeholder="Perplexity"
                                value={newName}
                                onChange={event => setNewName(event.target.value)}
                            />
                        </label>
                        <label>
                            URL
                            <input
                                placeholder="perplexity.ai"
                                value={newUrl}
                                onChange={event => setNewUrl(event.target.value)}
                            />
                        </label>
                        <div className="sidebar-popover-actions">
                            <button type="button" onClick={() => setIsAdding(false)}>Cancel</button>
                            <button type="submit" className="primary" disabled={!newName.trim() || !newUrl.trim()}>Add site</button>
                        </div>
                    </form>
                </div>
            )}

            {contextMenu && (
                <div
                    className="sidebar-context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={event => event.stopPropagation()}
                >
                    <button type="button" onClick={() => handleDelete(contextMenu.toolId)}>Remove site</button>
                </div>
            )}
        </nav>
    );
};
