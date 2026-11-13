import {
    db,
    DEFAULT_ADMIN_EMAIL,
    DEFAULT_ADMIN_PASSWORD,
    DEFAULT_ADMIN_USER_ID,
    DEFAULT_WORKSPACE_ID,
    type MemberRole,
    type User,
    type UserRole,
} from '../db';
import { apiRequest, clearAuthToken, getAuthToken, setAuthToken } from './api';
import { ensureAlgoPipelines } from './algo';
import { AppError } from './errors';
import { colorFor, email as validateEmail, required } from './validation';

export type SessionUser = Omit<User, 'passwordHash' | 'passwordSalt'>;

const SESSION_KEY = 'ninai_session_user';
const DEFAULT_ADMIN_FLAG = 'ninai_default_admin';

let seedPromise: Promise<void> | null = null;

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return bytes;
}

export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
    const actualSalt = salt || bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: hexToBytes(actualSalt) as BufferSource, iterations: 120_000, hash: 'SHA-256' },
        keyMaterial,
        256,
    );
    return { hash: bytesToHex(new Uint8Array(bits)), salt: actualSalt };
}

async function verifyPassword(password: string, user: User): Promise<boolean> {
    const { hash } = await hashPassword(password, user.passwordSalt);
    return hash === user.passwordHash;
}

export function publicUser(user: User): SessionUser {
    const { passwordHash: _hash, passwordSalt: _salt, ...safe } = user;
    return safe;
}

async function seedDefaultAdmin(): Promise<void> {
    const existing = await db.users.where('email').equals(DEFAULT_ADMIN_EMAIL).first();
    if (existing) return;

    const { hash, salt } = await hashPassword(DEFAULT_ADMIN_PASSWORD);
    const now = Date.now();
    const admin: User = {
        id: 'user_admin',
        name: 'Workspace Admin',
        email: DEFAULT_ADMIN_EMAIL,
        role: 'admin',
        passwordHash: hash,
        passwordSalt: salt,
        workspaceId: DEFAULT_WORKSPACE_ID,
        avatarColor: '#0071e3',
        active: 1,
        createdAt: now,
        updatedAt: now,
    };
    await db.users.add(admin);
    localStorage.setItem(DEFAULT_ADMIN_FLAG, 'true');
}

async function seedStages(workspaceId: string): Promise<void> {
    await ensureAlgoPipelines(workspaceId);
}

async function doSeed(): Promise<void> {
    await db.open();

    let workspace = await db.workspaces.get(DEFAULT_WORKSPACE_ID);
    if (!workspace) {
        workspace = {
            id: DEFAULT_WORKSPACE_ID,
            name: 'NINAI Workspace',
            description: 'Your internal business workspace',
            ownerId: 'user_admin',
            createdAt: Date.now(),
        };
        await db.workspaces.add(workspace);
    }

    await seedStages(DEFAULT_WORKSPACE_ID);
    await seedDefaultAdmin();

    const membership = await db.workspaceMembers
        .where('[workspaceId+userId]')
        .equals([DEFAULT_WORKSPACE_ID, 'user_admin'])
        .first();
    if (!membership) {
        await db.workspaceMembers.add({
            id: crypto.randomUUID(),
            workspaceId: DEFAULT_WORKSPACE_ID,
            userId: 'user_admin',
            role: 'owner',
            createdAt: Date.now(),
        });
    }

    // Ensure the existing notes experience has its default folders and note.
    await db.populateFromLocalStorage();
}

export function ensureSeedData(): Promise<void> {
    if (!seedPromise) {
        seedPromise = doSeed().catch(error => {
            seedPromise = null;
            throw error;
        });
    }
    return seedPromise;
}

/**
 * Links a signed-in cloud account to the local workspace.
 *
 * A cloud user has an id from Postgres, so on a fresh device there is no
 * membership row for them and the workspace would come back empty. This
 * makes sure the workspace, pipeline and folders exist locally and then
 * attaches the account with the role the server gave it.
 *
 * When the account is an administrator it also takes over from the local
 * placeholder owner that first run creates, so the team sees only the real
 * people in the member list.
 */
async function ensureWorkspaceMembership(user: SessionUser): Promise<void> {
    await ensureSeedData();
    const isAdmin = user.role === 'admin';
    const localRole: MemberRole = isAdmin ? 'owner' : 'member';

    if (isAdmin) {
        // Hand the workspace over from the placeholder to the real account.
        const workspace = await db.workspaces.get(DEFAULT_WORKSPACE_ID);
        if (workspace && workspace.ownerId === DEFAULT_ADMIN_USER_ID) {
            await db.workspaces.update(DEFAULT_WORKSPACE_ID, { ownerId: user.id });
        }
        const placeholder = await db.workspaceMembers
            .where('[workspaceId+userId]')
            .equals([DEFAULT_WORKSPACE_ID, DEFAULT_ADMIN_USER_ID])
            .first();
        if (placeholder && placeholder.userId !== user.id) {
            await db.workspaceMembers.delete(placeholder.id);
        }
    }

    const membership = await db.workspaceMembers
        .where('[workspaceId+userId]')
        .equals([DEFAULT_WORKSPACE_ID, user.id])
        .first();
    if (membership) {
        // Keep the local role in step with the server.
        if (membership.role !== localRole) {
            await db.workspaceMembers.update(membership.id, { role: localRole });
        }
        return;
    }
    await db.workspaceMembers.add({
        id: crypto.randomUUID(),
        workspaceId: DEFAULT_WORKSPACE_ID,
        userId: user.id,
        role: localRole,
        createdAt: Date.now(),
    });
}

export async function login(email: string, password: string): Promise<SessionUser> {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) throw new AppError('AUTH', 'Enter your email and password.');

    try {
        // Authenticate against Backend PostgreSQL API
        const data = await apiRequest<{ user: { id: string; name: string; email: string; role?: string }; token: string }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email: normalized, password }),
        });

        setAuthToken(data.token);

        const now = Date.now();
        const sessionUser: SessionUser = {
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
            // The server decides the role. Members stay members until an admin
            // is granted in the workspace, never the other way round.
            role: data.user.role === 'admin' ? 'admin' : 'member',
            workspaceId: DEFAULT_WORKSPACE_ID,
            avatarColor: colorFor(data.user.name),
            active: 1,
            createdAt: now,
            updatedAt: now,
            lastLoginAt: now,
        };

        // Cache in Dexie for offline lookup and relationship consistency
        await db.users.put({
            ...sessionUser,
            passwordHash: '',
            passwordSalt: '',
        });

        await ensureWorkspaceMembership(sessionUser);

        localStorage.setItem(SESSION_KEY, data.user.id);
        return sessionUser;
    } catch (apiErr: any) {
        // If the error was explicitly invalid credentials from the server, throw it directly
        if (apiErr.code === 'AUTH' || apiErr.code === 'VALIDATION' || apiErr.code === 'API') {
            throw apiErr;
        }

        // Fallback for offline local dev mode if server is not reachable
        await ensureSeedData();
        const localUser = await db.users.where('email').equals(normalized).first();
        if (!localUser || localUser.active !== 1) throw new AppError('AUTH', 'Invalid email or password.');

        const valid = await verifyPassword(password, localUser);
        if (!valid) throw new AppError('AUTH', 'Invalid email or password.');

        const now = Date.now();
        await db.users.update(localUser.id, { lastLoginAt: now });
        localStorage.setItem(SESSION_KEY, localUser.id);
        return publicUser({ ...localUser, lastLoginAt: now });
    }
}

export function logout(): void {
    clearAuthToken();
    localStorage.removeItem(SESSION_KEY);
}

export function getSessionUserId(): string | null {
    return localStorage.getItem(SESSION_KEY);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
    const token = getAuthToken();
    const storedId = getSessionUserId();

    if (token) {
        try {
            const data = await apiRequest<{ user: { id: string; name: string; email: string; role?: string } }>('/auth/me');
            if (data?.user) {
                const now = Date.now();
                const sessionUser: SessionUser = {
                    id: data.user.id,
                    name: data.user.name,
                    email: data.user.email,
                    role: data.user.role === 'admin' ? 'admin' : 'member',
                    workspaceId: DEFAULT_WORKSPACE_ID,
                    avatarColor: colorFor(data.user.name),
                    active: 1,
                    createdAt: now,
                    updatedAt: now,
                    lastLoginAt: now,
                };
                await db.users.put({
                    ...sessionUser,
                    passwordHash: '',
                    passwordSalt: '',
                });
                await ensureWorkspaceMembership(sessionUser);
                return sessionUser;
            }
        } catch {
            // Token expired or invalid
            clearAuthToken();
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
    }

    if (!storedId) return null;
    const user = await db.users.get(storedId);
    if (!user || user.active !== 1) {
        localStorage.removeItem(SESSION_KEY);
        return null;
    }
    return publicUser(user);
}

export async function requireUser(): Promise<SessionUser> {
    const user = await getCurrentUser();
    if (!user) throw new AppError('AUTH', 'Your session has expired. Please sign in again.');
    return user;
}

export function hasDefaultAdminPassword(): boolean {
    return localStorage.getItem(DEFAULT_ADMIN_FLAG) === 'true';
}

export async function updateOwnProfile(input: { name: string; email: string }): Promise<SessionUser> {
    const current = await requireUser();
    const full = await db.users.get(current.id);
    if (!full) throw new AppError('NOT_FOUND', 'User not found.');

    const name = required(input.name, 'Name', 80);
    const email = validateEmail(input.email, 'Email');
    if (!email) throw new AppError('VALIDATION', 'Email is required.');

    const other = await db.users.where('email').equals(email).first();
    if (other && other.id !== current.id) {
        throw new AppError('CONFLICT', 'Another account already uses this email.');
    }

    const updated = { ...full, name, email, updatedAt: Date.now() };
    await db.users.put(updated);
    return publicUser(updated);
}

export async function changeOwnPassword(currentPassword: string, nextPassword: string): Promise<void> {
    const current = await requireUser();
    const full = await db.users.get(current.id);
    if (!full) throw new AppError('NOT_FOUND', 'User not found.');
    if (nextPassword.length < 8) throw new AppError('VALIDATION', 'New password must be at least 8 characters.');

    const valid = await verifyPassword(currentPassword, full);
    if (!valid) throw new AppError('AUTH', 'Current password is incorrect.');

    const { hash, salt } = await hashPassword(nextPassword);
    await db.users.update(full.id, { passwordHash: hash, passwordSalt: salt, updatedAt: Date.now() });
    localStorage.removeItem(DEFAULT_ADMIN_FLAG);
}

export async function createUser(input: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    workspaceId: string;
}): Promise<SessionUser> {
    const actor = await requireUser();
    if (actor.role !== 'admin') throw new AppError('FORBIDDEN', 'Only admins can create users.');

    const name = required(input.name, 'Name', 80);
    const email = validateEmail(input.email, 'Email');
    if (!email) throw new AppError('VALIDATION', 'Email is required.');
    if (input.password.length < 8) throw new AppError('VALIDATION', 'Password must be at least 8 characters.');
    if (input.role !== 'admin' && input.role !== 'member') throw new AppError('VALIDATION', 'Invalid role.');

    const exists = await db.users.where('email').equals(email).first();
    if (exists) throw new AppError('CONFLICT', 'A user with that email already exists.');

    const { hash, salt } = await hashPassword(input.password);
    const now = Date.now();
    const user: User = {
        id: crypto.randomUUID(),
        name,
        email,
        role: input.role,
        passwordHash: hash,
        passwordSalt: salt,
        workspaceId: input.workspaceId,
        avatarColor: colorFor(email),
        active: 1,
        createdAt: now,
        updatedAt: now,
    };

    await db.transaction('rw', [db.users, db.workspaceMembers], async () => {
        await db.users.add(user);
        await db.workspaceMembers.add({
            id: crypto.randomUUID(),
            workspaceId: input.workspaceId,
            userId: user.id,
            role: input.role === 'admin' ? 'owner' : 'member',
            createdAt: now,
        });
    });

    return publicUser(user);
}

export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
    const actor = await requireUser();
    if (actor.role !== 'admin') throw new AppError('FORBIDDEN', 'Only admins can change roles.');
    if (role !== 'admin' && role !== 'member') throw new AppError('VALIDATION', 'Invalid role.');

    const target = await db.users.get(userId);
    if (!target) throw new AppError('NOT_FOUND', 'User not found.');

    if (target.role === 'admin' && role === 'member') {
        const admins = await db.users.where('role').equals('admin').filter(u => u.active === 1).toArray();
        if (admins.length <= 1) throw new AppError('CONFLICT', 'At least one active admin is required.');
    }

    await db.users.update(userId, { role, updatedAt: Date.now() });
}

export async function setUserActive(userId: string, active: boolean): Promise<void> {
    const actor = await requireUser();
    if (actor.role !== 'admin') throw new AppError('FORBIDDEN', 'Only admins can manage users.');
    if (userId === actor.id && !active) throw new AppError('CONFLICT', 'You cannot deactivate your own account.');

    const target = await db.users.get(userId);
    if (!target) throw new AppError('NOT_FOUND', 'User not found.');

    if (!active && target.role === 'admin') {
        const admins = await db.users.where('role').equals('admin').filter(u => u.active === 1).toArray();
        if (admins.length <= 1) throw new AppError('CONFLICT', 'At least one active admin is required.');
    }

    await db.users.update(userId, { active: active ? 1 : 0, updatedAt: Date.now() });
    if (!active && getSessionUserId() === userId) logout();
}

export async function resetUserPassword(userId: string, password: string): Promise<void> {
    const actor = await requireUser();
    if (actor.role !== 'admin') throw new AppError('FORBIDDEN', 'Only admins can reset passwords.');
    if (password.length < 8) throw new AppError('VALIDATION', 'Password must be at least 8 characters.');

    const target = await db.users.get(userId);
    if (!target) throw new AppError('NOT_FOUND', 'User not found.');
    const { hash, salt } = await hashPassword(password);
    await db.users.update(userId, { passwordHash: hash, passwordSalt: salt, updatedAt: Date.now() });
}

export async function listUsers(): Promise<SessionUser[]> {
    const actor = await requireUser();
    if (actor.role !== 'admin') throw new AppError('FORBIDDEN', 'Only admins can list all users.');
    const users = await db.users.toArray();
    return users.map(publicUser).sort((a, b) => a.name.localeCompare(b.name));
}
