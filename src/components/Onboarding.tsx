import React, { useState } from 'react';
import { db } from '../db';
import { importBackup } from '../utils/export';

interface OnboardingProps {
    onComplete: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = () => {
    const [isRestoring, setIsRestoring] = useState(false);

    const handleNewUser = async () => {
        // "Start as New User" = Wipe everything -> Set Flag -> Reload
        // This relies on the main App boot logic (db.ts) to see empty DB and seed defaults.
        try {
            console.log("Performing robust reset...");

            // 1. Attempt to close DB (Best Effort)
            try { db.close(); } catch (e) { console.warn("DB close ignored", e); }

            // 2. Delete DB (Best Effort - if locked, it might fail, but we proceed)
            try { await db.delete(); } catch (e) { console.warn("DB delete soft-fail", e); }

            // 3. Clear Local Storage
            localStorage.clear();

            // 4. Mark setup complete so the user goes straight to the Main App.
            localStorage.setItem('ninai_setup_complete', 'true');

            // 5. Hard Reload
            // This clears memory state and re-initializes the app fresh.
            window.location.reload();

        } catch (error) {
            console.error("Reset critical fail:", error);
            alert("Reset failed. Try manually clearing app data.");
            window.location.reload();
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsRestoring(true);
        const success = await importBackup(file);
        setIsRestoring(false);

        if (success) {
            localStorage.setItem('ninai_setup_complete', 'true');
            // Force reload to reflect data or just callback?
            // Callback handles state, but DB needs refresh. 
            // Better to reload window to ensure clean state from DB.
            window.location.reload();
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'var(--bg-app)', zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                width: '400px', padding: '60px 40px',
                background: '#ffffff',
                textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px'
            }}>
                {/* Logo Image */}
                <img
                    src="./logo.png"
                    alt="Ninai Logo"
                    style={{ width: '80px', height: '80px', objectFit: 'contain' }}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <h1 style={{
                        fontSize: '2rem', fontWeight: 700, color: '#000', letterSpacing: '-0.03em', margin: 0
                    }}>
                        NINAI
                    </h1>
                    <p style={{
                        fontSize: '1rem', color: '#666', lineHeight: 1.5, margin: 0, fontWeight: 500
                    }}>
                        Networking Interface N AI
                    </p>
                </div>

                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                    <button
                        className="primary"
                        style={{
                            padding: '16px', fontSize: '0.95rem', fontWeight: 600, justifyContent: 'center', width: '100%',
                            background: '#000', color: '#fff', borderRadius: '8px', border: 'none',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }}
                        onClick={handleNewUser}
                        onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
                        onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                    >
                        Start as New User
                    </button>

                    <div style={{ position: 'relative', overflow: 'hidden', width: '100%' }}>
                        <button
                            style={{
                                width: '100%', padding: '16px', fontSize: '0.95rem', fontWeight: 600,
                                background: 'transparent', color: '#000',
                                border: '1px solid #e5e5e5', borderRadius: '8px',
                                cursor: 'pointer', transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.borderColor = '#000'; e.currentTarget.style.background = '#fafafa'; }}
                            onMouseOut={(e) => { e.currentTarget.style.borderColor = '#e5e5e5'; e.currentTarget.style.background = 'transparent'; }}
                        >
                            {isRestoring ? 'Restoring...' : 'Restore from Backup'}
                        </button>
                        <input
                            type="file"
                            accept=".zip"
                            onChange={handleFileUpload}
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
