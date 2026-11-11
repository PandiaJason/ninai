import React, { useEffect, useRef, useState } from 'react';
import { exportBackup } from '../utils/export';
import { db } from '../db';
import type { ModuleId } from '../types/workspace';
import { Icon, type IconName } from './ui/Icon';
import './Sidebar.css';

interface SidebarProps {
    activeModule?: ModuleId;
    onSelectModule?: (module: ModuleId) => void;
    onOpenSearch?: () => void;
    workspaceName?: string;
    onSignOut?: () => void;
}

const PRIMARY_MODULES: { id: ModuleId; label: string; icon: IconName }[] = [
    { id: 'dashboard', label: 'Overview', icon: 'dashboard' },
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
    { id: 'analytics', label: 'Insights', icon: 'chart' },
    { id: 'notes', label: 'Notes', icon: 'notes' },
];

interface SidebarItemProps {
    label: string;
    icon: IconName;
    active: boolean;
    onSelect: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ label, icon, active, onSelect }) => (
    <button
        type="button"
        className={`sidebar-item ${active ? 'active' : ''}`}
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
    >
        <span className="sidebar-item-icon">
            <Icon name={icon} size={17} />
        </span>
        <span className="sidebar-item-label">{label}</span>
    </button>
);

export const Sidebar: React.FC<SidebarProps> = ({
    activeModule = 'dashboard',
    onSelectModule,
    onOpenSearch,
    workspaceName,
    onSignOut,
}) => {
    const [userName, setUserName] = useState(() => localStorage.getItem('ninai_username') || 'N');
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        localStorage.setItem('ninai_username', userName);
    }, [userName]);

    const userInitial = (Array.from(userName)[0] || 'N').toUpperCase();

    useEffect(() => {
        if (!showProfileMenu) return;
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!profileRef.current?.contains(target)) setShowProfileMenu(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setShowProfileMenu(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [showProfileMenu]);

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
        onSelectModule?.(module);
    };

    return (
        <nav className="sidebar-nav" aria-label="Main navigation">
            <div className="sidebar-brand" ref={profileRef}>
                <button
                    type="button"
                    className="sidebar-avatar"
                    onClick={() => setShowProfileMenu(value => !value)}
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
                            label={module.label}
                            icon={module.icon}
                            active={activeModule === module.id}
                            onSelect={() => selectModule(module.id)}
                        />
                    ))}
                </div>
            </div>
        </nav>
    );
};
