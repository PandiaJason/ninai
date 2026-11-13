import { AppError } from './errors';
import type { Priority } from '../db';

export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];
export const PRIORITY_LABEL: Record<Priority, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent',
};

export function required(value: unknown, label: string, max = 500): string {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw new AppError('VALIDATION', `${label} is required.`);
    if (text.length > max) throw new AppError('VALIDATION', `${label} must be ${max} characters or fewer.`);
    return text;
}

export function optional(value: unknown, label: string, max = 2000): string | undefined {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return undefined;
    if (text.length > max) throw new AppError('VALIDATION', `${label} must be ${max} characters or fewer.`);
    return text;
}

export function email(value: unknown, label = 'Email'): string | undefined {
    const text = optional(value, label, 254);
    if (!text) return undefined;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        throw new AppError('VALIDATION', `${label} is not a valid email address.`);
    }
    return text.toLowerCase();
}

export function website(value: unknown): string | undefined {
    const text = optional(value, 'Website', 500);
    if (!text) return undefined;
    const normalized = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    try {
        const url = new URL(normalized);
        if (!url.hostname.includes('.')) throw new Error('invalid');
        return url.toString();
    } catch {
        throw new AppError('VALIDATION', 'Website is not a valid URL.');
    }
}

export function numberValue(value: unknown, label: string, min = 0, max = 1_000_000_000): number {
    const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(n) || n < min || n > max) {
        throw new AppError('VALIDATION', `${label} must be a number between ${min} and ${max}.`);
    }
    return Math.round(n);
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string, fallback?: T): T {
    if (allowed.includes(value as T)) return value as T;
    if (fallback !== undefined) return fallback;
    throw new AppError('VALIDATION', `${label} is invalid.`);
}

export function assertDateInput(value: string | undefined, label: string): string | undefined {
    if (!value) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) {
        throw new AppError('VALIDATION', `${label} is not a valid date.`);
    }
    return value;
}

export function dateKey(d: Date | number | string): string {
    const date = d instanceof Date ? d : new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function dateKeyToDate(key: string): Date {
    return new Date(`${key}T00:00:00`);
}

export function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function addDays(d: Date, days: number): Date {
    const next = new Date(d);
    next.setDate(next.getDate() + days);
    return next;
}

export function isOverdue(dueDate?: string): boolean {
    if (!dueDate) return false;
    return new Date(`${dueDate}T23:59:59`).getTime() < Date.now();
}

export function formatDate(value?: string | number | Date | null): string {
    if (value === undefined || value === null || value === '') return '—';
    const d = value instanceof Date ? value : typeof value === 'number' ? new Date(value) : new Date(value.length === 10 ? `${value}T00:00:00` : value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value?: number | Date | null): string {
    if (!value) return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatTime(value: number | Date): string {
    const d = value instanceof Date ? value : new Date(value);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function timeAgo(value: number | Date): string {
    const d = value instanceof Date ? value.getTime() : value;
    const diff = Date.now() - d;
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return formatDate(d);
}

export function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase())
        .join('') || '?';
}

const AVATAR_COLORS = ['#0071e3', '#5e5ce6', '#30b0c7', '#34c759', '#ff9f0a', '#ff375f', '#8e8e93', '#af52de'];

export function colorFor(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function toDatetimeLocal(value?: number): string {
    const d = value ? new Date(value) : new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocal(value: string): number {
    const t = new Date(value).getTime();
    if (Number.isNaN(t)) throw new AppError('VALIDATION', 'Please choose a valid date and time.');
    return t;
}

export function sanitizeText(value: string): string {
    return value.replace(/\u0000/g, '').trim();
}
