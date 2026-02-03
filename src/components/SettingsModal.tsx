import React, { useEffect, useState } from 'react';

interface SettingsModalProps {
    onClose: () => void;
}

type Theme = 'light' | 'dark' | 'system';
type FontFamily = 'sans' | 'serif' | 'mono';

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
    // State
    const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('ninai_theme') as Theme) || 'system');
    const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('ninai_font_size') || '15'));
    const [fontFamily, setFontFamily] = useState<FontFamily>(() => (localStorage.getItem('ninai_font_family') as FontFamily) || 'sans');

    // Effects for applying settings
    useEffect(() => {
        // Theme Logic
        const applyTheme = (t: Theme) => {
            const root = document.documentElement;
            const isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

            if (isDark) {
                root.setAttribute('data-theme', 'dark');
            } else {
                root.setAttribute('data-theme', 'light');
            }
            localStorage.setItem('ninai_theme', t);
        };
        applyTheme(theme);
    }, [theme]);

    useEffect(() => {
        // Font Size Logic
        document.documentElement.style.setProperty('--font-size-base', `${fontSize}px`);
        localStorage.setItem('ninai_font_size', fontSize.toString());
    }, [fontSize]);

    useEffect(() => {
        // Font Family Logic
        const map = {
            'sans': 'var(--font-sans)',
            'serif': 'var(--font-serif)',
            'mono': 'var(--font-mono)'
        };
        document.documentElement.style.setProperty('--current-font', map[fontFamily]);
        localStorage.setItem('ninai_font_family', fontFamily);
    }, [fontFamily]);

    return (
        <div className="settings-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.4)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={onClose}>
            <div className="settings-modal glass" style={{
                width: '400px', padding: '24px', borderRadius: '16px',
                background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-lg)'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Settings</h2>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-secondary)'
                    }}>✕</button>
                </div>

                {/* Section: Appearance */}
                <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: '12px', fontWeight: 600 }}>Appearance</h3>
                    <div style={{ display: 'flex', background: 'var(--surface-mid)', padding: '4px', borderRadius: '8px' }}>
                        {(['light', 'dark', 'system'] as Theme[]).map(t => (
                            <button key={t} onClick={() => setTheme(t)} style={{
                                flex: 1, padding: '6px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                fontSize: '13px', textTransform: 'capitalize',
                                background: theme === t ? 'var(--bg-app)' : 'transparent',
                                color: theme === t ? 'var(--text-primary)' : 'var(--text-secondary)',
                                boxShadow: theme === t ? 'var(--shadow-sm)' : 'none',
                                fontWeight: theme === t ? 500 : 400
                            }}>
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Section: Typography */}
                <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: '12px', fontWeight: 600 }}>Typography</h3>

                    {/* Font Size */}
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                            <span>Size</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{fontSize}px</span>
                        </div>
                        <input type="range" min="12" max="24" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))}
                            style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                    </div>

                    {/* Font Family */}
                    <div style={{ display: 'flex', background: 'var(--surface-mid)', padding: '4px', borderRadius: '8px' }}>
                        {(['sans', 'serif', 'mono'] as FontFamily[]).map(f => (
                            <button key={f} onClick={() => setFontFamily(f)} style={{
                                flex: 1, padding: '6px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                fontSize: '13px', textTransform: 'capitalize',
                                background: fontFamily === f ? 'var(--bg-app)' : 'transparent',
                                color: fontFamily === f ? 'var(--text-primary)' : 'var(--text-secondary)',
                                boxShadow: fontFamily === f ? 'var(--shadow-sm)' : 'none',
                                fontWeight: fontFamily === f ? 500 : 400
                            }}>
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '30px' }}>
                    Ninai v1.1.3 • <a href="#" style={{ color: 'var(--accent-primary)' }}>Terms</a> • <a href="#" style={{ color: 'var(--accent-primary)' }}>Privacy</a>
                </div>

            </div>
        </div>
    );
};
