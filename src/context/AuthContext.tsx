import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
    ensureSeedData,
    getCurrentUser,
    login as authLogin,
    logout as authLogout,
    type SessionUser,
} from '../services/auth';
import {
    listWorkspaceUsers,
    listWorkspaces,
    resolveActiveWorkspace,
    storeWorkspaceId,
    type WorkspaceUser,
    type WorkspaceWithRole,
} from '../services/workspace';
import { toErrorMessage } from '../services/errors';

interface AuthContextValue {
    user: SessionUser | null;
    workspace: WorkspaceWithRole | null;
    workspaces: WorkspaceWithRole[];
    members: WorkspaceUser[];
    loading: boolean;
    error: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshAuth: () => Promise<void>;
    refreshWorkspaces: () => Promise<void>;
    refreshMembers: () => Promise<void>;
    switchWorkspace: (workspaceId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<SessionUser | null>(null);
    const [workspace, setWorkspace] = useState<WorkspaceWithRole | null>(null);
    const [workspaces, setWorkspaces] = useState<WorkspaceWithRole[]>([]);
    const [members, setMembers] = useState<WorkspaceUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadMembers = useCallback(async (workspaceId: string | undefined) => {
        if (!workspaceId) {
            setMembers([]);
            return;
        }
        try {
            setMembers(await listWorkspaceUsers(workspaceId));
        } catch (e) {
            console.error('Failed to load workspace members', e);
            setMembers([]);
        }
    }, []);

    const loadForUser = useCallback(async (current: SessionUser) => {
        const list = await listWorkspaces();
        setWorkspaces(list);
        const active = await resolveActiveWorkspace(current);
        setWorkspace(active);
        await loadMembers(active?.id);
    }, [loadMembers]);

    const refreshAuth = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            await ensureSeedData();
            const current = await getCurrentUser();
            setUser(current);
            if (current) {
                await loadForUser(current);
            } else {
                setWorkspace(null);
                setWorkspaces([]);
                setMembers([]);
            }
        } catch (e) {
            console.error(e);
            setError(toErrorMessage(e));
        } finally {
            setLoading(false);
        }
    }, [loadForUser]);

    useEffect(() => {
        void refreshAuth();
    }, [refreshAuth]);

    const login = useCallback(async (email: string, password: string) => {
        setError(null);
        const current = await authLogin(email, password);
        setUser(current);
        await loadForUser(current);
    }, [loadForUser]);

    const logout = useCallback(async () => {
        authLogout();
        setUser(null);
        setWorkspace(null);
        setWorkspaces([]);
        setMembers([]);
    }, []);

    const refreshWorkspaces = useCallback(async () => {
        if (!user) return;
        await loadForUser(user);
    }, [user, loadForUser]);

    const refreshMembers = useCallback(async () => {
        await loadMembers(workspace?.id);
    }, [loadMembers, workspace?.id]);

    const switchWorkspace = useCallback(async (workspaceId: string) => {
        const target = workspaces.find(w => w.id === workspaceId);
        if (!target) return;
        storeWorkspaceId(workspaceId);
        setWorkspace(target);
        await loadMembers(workspaceId);
    }, [workspaces, loadMembers]);

    const value = useMemo<AuthContextValue>(() => ({
        user,
        workspace,
        workspaces,
        members,
        loading,
        error,
        login,
        logout,
        refreshAuth,
        refreshWorkspaces,
        refreshMembers,
        switchWorkspace,
    }), [user, workspace, workspaces, members, loading, error, login, logout, refreshAuth, refreshWorkspaces, refreshMembers, switchWorkspace]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
}
