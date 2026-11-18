import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { hasDefaultAdminPassword } from '../../services/auth';
import { getApiBase } from '../../services/api';
import { toErrorMessage } from '../../services/errors';
import { Button } from '../ui/Misc';
import { Field, TextInput } from '../ui/Form';
import { Icon } from '../ui/Icon';

export const LoginScreen: React.FC = () => {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const firstRun = hasDefaultAdminPassword();
    // A configured server means the accounts live on the server, so the local
    // first-run default no longer applies.
    const hasServer = getApiBase() !== 'http://localhost:3001/api';

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
        } catch (err) {
            setError(toErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="ws-auth-screen">
            <div className="ws-auth-visual">
                <div className="ws-auth-brand">
                    <img src="./logo.png" alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
                    <span>NINAI</span>
                </div>
                <h1>One workspace for the work that matters.</h1>
                <p>Leads, tasks and the knowledge behind them — in one local-first place.</p>
                <div className="ws-auth-points">
                    <span><Icon name="crm" size={16} /> CRM pipeline</span>
                    <span><Icon name="tasks" size={16} /> Task tracking</span>
                    <span><Icon name="notes" size={16} /> Knowledge base</span>
                </div>
            </div>

            <div className="ws-auth-panel">
                <form className="ws-auth-card" onSubmit={submit}>
                    <div className="ws-auth-card-head">
                        <img className="ws-auth-mini-logo" src="./logo.png" alt="NINAI" />
                        <div>
                            <h2>Sign in to NINAI</h2>
                            <p>Use your workspace account.</p>
                        </div>
                    </div>

                    {error && (
                        <div className="ws-form-error">
                            <Icon name="alert" size={15} />
                            <span>{error}</span>
                        </div>
                    )}

                    <Field label="Email address" htmlFor="login-email" required>
                        <TextInput
                            id="login-email"
                            type="email"
                            autoComplete="username"
                            autoFocus
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="you@company.com"
                        />
                    </Field>

                    <Field label="Password" htmlFor="login-password" required>
                        <div className="ws-password-wrap">
                            <TextInput
                                id="login-password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Your password"
                            />
                            <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                <Icon name="eye" size={16} />
                            </button>
                        </div>
                    </Field>

                    <Button type="submit" variant="primary" size="md" loading={loading} className="ws-auth-submit">
                        Sign in
                    </Button>

                    {/* The default admin login is only ever shown in local development builds. */}
                    {import.meta.env.DEV && firstRun && !hasServer && (
                        <div className="ws-auth-hint">
                            <strong>First time?</strong>
                            <span>Default admin: <code>admin@ninai.app</code> / <code>ninai-admin</code></span>
                            <span>Change this password in Settings after signing in.</span>
                        </div>
                    )}

                    {firstRun && hasServer && (
                        <div className="ws-auth-hint">
                            <strong>Shared workspace</strong>
                            <span>Sign in with the account your team uses. If you do not have one yet, ask whoever set up the workspace.</span>
                        </div>
                    )}

                    <p className="ws-auth-footnote">
                        <Icon name="lock" size={12} /> {hasServer
                            ? 'Your account and shared records are stored on your team’s server'
                            : 'Your account is stored locally on this device'}
                    </p>
                </form>
            </div>
        </div>
    );
};
