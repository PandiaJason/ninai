import React, { useState, useEffect } from 'react';
import { exportBackup } from '../utils/export';
import { db } from '../db';
import './Sidebar.css';

interface SidebarProps {
    tools: any[];
    activeToolId: string;
    onSelectTool: (id: string) => void;
    onAddTool: (name: string, url: string) => void;
    onDeleteTool: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ tools, activeToolId, onSelectTool, onAddTool, onDeleteTool }) => {
    // --- User Profile State ---
    const [userName, setUserName] = useState(() => localStorage.getItem('ninai_username') || 'N');
    const [showProfileMenu, setShowProfileMenu] = useState(false);

    useEffect(() => {
        localStorage.setItem('ninai_username', userName);
    }, [userName]);

    const userInitial = (Array.from(userName)[0] || 'N').toUpperCase();

    // --- Tool Management State ---
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, toolId: string } | null>(null);

    useEffect(() => {
        const closeMenu = () => {
            setContextMenu(null);
            // Don't close profile menu on every click inside it, handled separately
        };
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, []);

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
                // 1. Close and Delete DB
                db.close();
                await db.delete();

                // 2. Clear LocalStorage
                localStorage.clear();

                // 3. Mark setup as incomplete explicitly
                localStorage.setItem('ninai_setup_complete', 'false');

                // 4. Force Reload
                alert("Reset Complete. The app will now reload.");
                window.location.reload();
            } catch (e) {
                alert("Reset failed: " + e);
                window.location.reload(); // Reload anyway to try and clear locks
            }
        }
    };

    return (
        <nav className="sidebar-nav">
            {/* 1. User Profile (Top Left) */}
            <div className="sidebar-logo interactive" onClick={() => setShowProfileMenu(!showProfileMenu)} title="User Settings">
                <span className="logo-text">{userInitial}</span>
            </div>

            {/* Profile Popover */}
            {showProfileMenu && (
                <div className="add-tool-popover profile-menu">
                    <h3 style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>
                        User Profile
                    </h3>
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
                                fontWeight: 500
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Backup Data
                        </button>

                        <div className="divider" />

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
                                fontWeight: 600
                            }}
                        >
                            ⚠️ Factory Reset
                        </button>
                    </div>
                    <button className="close-link" onClick={() => setShowProfileMenu(false)}>Close</button>
                </div>
            )
            }

            <div className="tools-list">
                {tools.map((tool) => (
                    <button
                        key={tool.id}
                        className={`tool-icon ${activeToolId === tool.id ? 'active' : ''}`}
                        onClick={() => onSelectTool(tool.id)}
                        onContextMenu={(e) => handleContextMenu(e, tool.id)}
                        style={{ '--tool-color': tool.color } as React.CSSProperties}
                        aria-label={`Switch to ${tool.name}`}
                        title={tool.name}
                    >
                        {tool.label}
                    </button>
                ))}

                <button
                    className={`tool-icon add-btn ${isAdding ? 'active' : ''}`}
                    onClick={() => setIsAdding(!isAdding)}
                    title="Add Custom Site"
                >
                    +
                </button>
            </div>

            {/* Popover Form for Adding Tool */}
            {
                isAdding && (
                    <div className="add-tool-popover">
                        <h3>Add Site</h3>
                        <form onSubmit={handleAddSubmit}>
                            <input
                                autoFocus
                                placeholder="Name (e.g. Perplexity)"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                            />
                            <input
                                placeholder="URL (e.g. perplexity.ai)"
                                value={newUrl}
                                onChange={e => setNewUrl(e.target.value)}
                            />
                            <div className="popover-actions">
                                <button type="button" onClick={() => setIsAdding(false)}>Cancel</button>
                                <button type="submit" disabled={!newName || !newUrl} className="primary">Add</button>
                            </div>
                        </form>
                    </div>
                )
            }

            {/* Simple Context Menu */}
            {
                contextMenu && (
                    <div
                        className="context-menu"
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button onClick={() => handleDelete(contextMenu.toolId)} className="menu-item delete">
                            Delete
                        </button>
                    </div>
                )
            }

            <div className="sidebar-footer">
                {/* Removed unused placeholder circle */}
            </div>
        </nav >
    );
};
