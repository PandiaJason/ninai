import {
    db,
    type GmailConnection,
    type GmailMessage,
    type GmailMessageStatus,
    type Lead,
} from '../db';
import { requireUser } from './auth';
import { AppError } from './errors';
import { assertWorkspaceAccess } from './permissions';
import { addLeadActivity, logChallengeAttempt } from './leads';
import { saveLearnerFeedback } from './feedback';
import { createFollowUp } from './followUps';
import { logActivity } from './activity';
import { toErrorMessage } from './errors';
import {
    buildLearnerQuery,
    classifyLearnerMessage,
    exchangeCodeForTokens,
    fetchGmailAccountEmail,
    fetchGmailMessage,
    fetchGmailMessageList,
    listLearnerEmails,
    matchLeadByEmail,
    parseGmailMessage,
    summarizeMessage,
    type GmailAuth,
} from './gmail';

const REFRESH_WINDOW_MS = 60_000;

export interface GmailSyncSummary {
    scanned: number;
    matched: number;
    new: number;
    alreadySeen: number;
    skipped: number;
}

export interface GmailSyncOptions {
    /** How far back to look, in days. */
    days?: number;
}

export async function getGmailConnection(workspaceId: string): Promise<GmailConnection | undefined> {
    return db.gmailConnections.where('workspaceId').equals(workspaceId).first();
}

export async function connectGmail(input: {
    workspaceId: string;
    clientId: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
}): Promise<GmailConnection> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, input.workspaceId);

    const clientId = input.clientId.trim();
    if (!clientId) throw new AppError('VALIDATION', 'A Google OAuth client id is required.');

    const tokens = await exchangeCodeForTokens({
        clientId,
        code: input.code,
        codeVerifier: input.codeVerifier,
        redirectUri: input.redirectUri,
    });
    if (!tokens.refresh_token) {
        throw new AppError('AUTH', 'Google did not return a refresh token. Revoke the app access and reconnect.');
    }
    const email = await fetchGmailAccountEmail(tokens.access_token);

    const now = Date.now();
    const existing = await getGmailConnection(input.workspaceId);
    const connection: GmailConnection = {
        id: existing?.id || crypto.randomUUID(),
        workspaceId: input.workspaceId,
        email,
        clientId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: now + tokens.expires_in * 1000,
        scope: tokens.scope || '',
        lastSyncedAt: existing?.lastSyncedAt,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        createdBy: existing?.createdBy || actor.id,
    };
    await db.gmailConnections.put(connection);
    return connection;
}

export async function disconnectGmail(workspaceId: string): Promise<void> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const connection = await getGmailConnection(workspaceId);
    if (!connection) return;
    await db.gmailMessages.where('connectionId').equals(connection.id).delete();
    await db.gmailConnections.delete(connection.id);
}

async function authFor(connection: GmailConnection): Promise<GmailAuth> {
    if (connection.expiresAt - REFRESH_WINDOW_MS > Date.now()) {
        return {
            accessToken: connection.accessToken,
            refreshToken: connection.refreshToken,
            expiresAt: connection.expiresAt,
            scope: connection.scope,
            clientId: connection.clientId,
        };
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: connection.clientId,
            refresh_token: connection.refreshToken,
            grant_type: 'refresh_token',
        }).toString(),
    });
    if (!response.ok) {
        throw new AppError('AUTH', 'The Gmail connection expired. Reconnect it in Settings.');
    }
    const payload = await response.json() as { access_token: string; expires_in: number };
    const expiresAt = Date.now() + payload.expires_in * 1000;
    await db.gmailConnections.update(connection.id, {
        accessToken: payload.access_token,
        expiresAt,
        updatedAt: Date.now(),
    });
    return {
        accessToken: payload.access_token,
        refreshToken: connection.refreshToken,
        expiresAt,
        scope: connection.scope,
        clientId: connection.clientId,
    };
}

/**
 * Reads the connected mailbox and turns learner emails into reviewable CRM updates.
 * Nothing is written to a learner record here — every message waits for review.
 */
export async function syncGmail(
    workspaceId: string,
    options: GmailSyncOptions = {},
): Promise<GmailSyncSummary> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);

    const connection = await getGmailConnection(workspaceId);
    if (!connection) throw new AppError('AUTH', 'Connect a Gmail account first.');
    const auth = await authFor(connection);

    const learners = await listLearnerEmails(workspaceId);
    const summary: GmailSyncSummary = { scanned: 0, matched: 0, new: 0, alreadySeen: 0, skipped: 0 };
    if (learners.length === 0) return summary;

    const query = buildLearnerQuery(learners.map(item => item.email), { days: options.days ?? 60 });
    if (!query) return summary;

    const listed = await fetchGmailMessageList(auth, query, 40);
    summary.scanned = listed.length;

    for (const item of listed) {
        const existing = await db.gmailMessages
            .where('[connectionId+gmailId]')
            .equals([connection.id, item.id])
            .first();
        if (existing) {
            summary.alreadySeen += 1;
            continue;
        }

        let parsed;
        try {
            parsed = parseGmailMessage(await fetchGmailMessage(auth, item.id));
        } catch {
            summary.skipped += 1;
            continue;
        }

        const lead = await matchLeadByEmail(workspaceId, parsed.fromEmail);
        const classification = classifyLearnerMessage({
            subject: parsed.subject,
            body: parsed.body,
            lead: lead || null,
        });
        if (lead) summary.matched += 1;

        const message: GmailMessage = {
            id: crypto.randomUUID(),
            workspaceId,
            connectionId: connection.id,
            gmailId: parsed.gmailId,
            threadId: parsed.threadId,
            leadId: lead?.id,
            from: parsed.from,
            fromEmail: parsed.fromEmail,
            to: parsed.to,
            subject: parsed.subject || '(no subject)',
            snippet: parsed.snippet,
            body: parsed.body,
            receivedAt: parsed.receivedAt,
            signal: classification.signal,
            confidence: classification.confidence,
            extracted: JSON.stringify({ ...classification.extracted, reasons: classification.reasons }),
            status: 'new',
            createdAt: Date.now(),
        };
        await db.gmailMessages.put(message);
        summary.new += 1;
    }

    await db.gmailConnections.update(connection.id, { lastSyncedAt: Date.now(), updatedAt: Date.now() });
    return summary;
}

export async function listGmailMessages(
    workspaceId: string,
    status?: GmailMessageStatus,
): Promise<(GmailMessage & { lead?: Pick<Lead, 'id' | 'name' | 'email' | 'stageId'> })[]> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const messages = status
        ? await db.gmailMessages.where('[workspaceId+status]').equals([workspaceId, status]).toArray()
        : await db.gmailMessages.where('workspaceId').equals(workspaceId).toArray();
    const sorted = messages.sort((a, b) => b.receivedAt - a.receivedAt);
    const leads = await db.leads.where('workspaceId').equals(workspaceId).toArray();
    const byId = new Map(leads.map(lead => [lead.id, lead]));
    return sorted.map(message => ({
        ...message,
        lead: message.leadId ? byId.get(message.leadId) : undefined,
    }));
}

export async function countPendingGmailMessages(workspaceId: string): Promise<number> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    return db.gmailMessages.where('[workspaceId+status]').equals([workspaceId, 'new']).count();
}

export interface ApplyGmailOptions {
    /** Rating chosen in the review card. */
    fdeHelpRating?: number;
    /** Stuck category chosen in the review card. */
    stuckCategory?: 'setup' | 'concepts' | 'difficulty' | 'time' | 'value' | 'motivation' | 'bug' | 'other';
}

/**
 * Applies a reviewed email to the matched learner record.
 * The CRM writes reuse the existing services so stage, feedback and activity rules stay intact.
 */
export async function applyGmailMessage(
    messageId: string,
    options: ApplyGmailOptions = {},
): Promise<GmailMessage> {
    const actor = await requireUser();
    const message = await db.gmailMessages.get(messageId);
    if (!message) throw new AppError('NOT_FOUND', 'Email not found.');
    await assertWorkspaceAccess(actor, message.workspaceId);
    if (message.status === 'applied') return message;
    if (!message.leadId) throw new AppError('VALIDATION', 'This email is not linked to a learner.');

    const lead = await db.leads.get(message.leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Learner not found.');

    let extracted: Record<string, any> = {};
    try {
        extracted = JSON.parse(message.extracted || '{}');
    } catch {
        extracted = {};
    }

    const excerpt = summarizeMessage(message);
    const tracks: string[] = Array.isArray(extracted.tracks) ? extracted.tracks : [];

    switch (message.signal) {
        case 'challenge': {
            await logChallengeAttempt(lead.id, { count: 1, track: extracted.track });
            await addLeadActivity(lead.id, {
                type: 'email',
                subject: `Email: ${message.subject}`,
                body: excerpt,
                occurredAt: message.receivedAt,
            });
            break;
        }
        case 'feedback': {
            const rating = Math.min(5, Math.max(1, Math.round(options.fdeHelpRating ?? extracted.fdeHelpRating ?? 3)));
            const category = options.stuckCategory || extracted.stuckCategory || 'other';
            await saveLearnerFeedback(lead.id, {
                whyStarted: extracted.whyStarted || 'Started ALGO after a challenge invitation (from email).',
                whereStuck: extracted.whereStuck || extracted.question || excerpt,
                stuckCategory: category,
                fdeHelpRating: rating,
                tracksExplored: tracks,
                continuedReason: undefined,
                stoppedReason: undefined,
                recommendations: extracted.question || undefined,
                themes: [],
                consentToContact: Boolean(extracted.consentToContact),
            });
            await addLeadActivity(lead.id, {
                type: 'email',
                subject: `Feedback email: ${message.subject}`,
                body: excerpt,
                occurredAt: message.receivedAt,
            });
            break;
        }
        case 'question':
        case 'meeting': {
            const title = message.signal === 'meeting'
                ? `Call with ${lead.name}`
                : `Reply to ${lead.name}: ${(extracted.question || message.subject).slice(0, 120)}`;
            const dueAt = Date.now() + 2 * 24 * 60 * 60 * 1000;
            await createFollowUp(message.workspaceId, {
                entityType: 'lead',
                entityId: lead.id,
                title,
                notes: excerpt,
                channel: message.signal === 'meeting' ? 'meeting' : 'email',
                dueAt,
            });
            await addLeadActivity(lead.id, {
                type: 'email',
                subject: `Email: ${message.subject}`,
                body: excerpt,
                occurredAt: message.receivedAt,
            });
            break;
        }
        default: {
            await addLeadActivity(lead.id, {
                type: 'email',
                subject: `Email: ${message.subject}`,
                body: excerpt,
                occurredAt: message.receivedAt,
            });
            break;
        }
    }

    await db.gmailMessages.update(messageId, { status: 'applied', appliedAt: Date.now() });
    await logActivity({
        workspaceId: message.workspaceId,
        userId: actor.id,
        entityType: 'lead',
        entityId: lead.id,
        action: 'gmail_applied',
        title: `Applied ${message.signal} email from ${lead.name}`,
    });
    const updated = await db.gmailMessages.get(messageId);
    return updated || message;
}

export async function ignoreGmailMessage(messageId: string): Promise<void> {
    const actor = await requireUser();
    const message = await db.gmailMessages.get(messageId);
    if (!message) throw new AppError('NOT_FOUND', 'Email not found.');
    await assertWorkspaceAccess(actor, message.workspaceId);
    await db.gmailMessages.update(messageId, { status: 'ignored' });
    await logActivity({
        workspaceId: message.workspaceId,
        userId: actor.id,
        entityType: 'lead',
        entityId: message.leadId || message.id,
        action: 'gmail_ignored',
        title: `Dismissed email "${message.subject}"`,
    });
}

export { toErrorMessage };
