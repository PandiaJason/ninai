import { db, type GmailMessage, type GmailSignal, type Lead, type StuckCategory } from '../db';
import { ALGO_TRACK_SUGGESTIONS } from './algo';
import { AppError } from './errors';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** Read-only access to the connected mailbox. */
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const GMAIL_SCOPES = [GMAIL_SCOPE, 'openid', 'email'].join(' ');

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

/* ------------------------------------------------------------------ */
/* OAuth (PKCE, desktop client)                                         */
/* ------------------------------------------------------------------ */

export interface PkcePair {
    verifier: string;
    challenge: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createPkcePair(): Promise<PkcePair> {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const verifier = base64UrlEncode(bytes);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)) };
}

export function buildGoogleAuthUrl(input: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
}): string {
    const params = new URLSearchParams({
        client_id: input.clientId,
        redirect_uri: input.redirectUri,
        response_type: 'code',
        scope: GMAIL_SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        code_challenge: input.codeChallenge,
        code_challenge_method: 'S256',
        state: input.state,
    });
    return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    id_token?: string;
}

async function requestTokens(body: URLSearchParams): Promise<TokenResponse> {
    const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
        const detail = typeof payload.error_description === 'string'
            ? payload.error_description
            : typeof payload.error === 'string' ? payload.error : 'Token request failed.';
        throw new AppError('AUTH', `Google sign-in failed: ${detail}`);
    }
    return payload as unknown as TokenResponse;
}

export async function exchangeCodeForTokens(input: {
    clientId: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
}): Promise<TokenResponse> {
    return requestTokens(new URLSearchParams({
        client_id: input.clientId,
        code: input.code,
        code_verifier: input.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUri,
    }));
}

export async function fetchGmailAccountEmail(accessToken: string): Promise<string> {
    const response = await fetch(USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new AppError('AUTH', 'Could not read the connected Gmail address.');
    const payload = await response.json().catch(() => ({})) as { email?: string };
    if (!payload.email) throw new AppError('AUTH', 'Google did not return an email address for this account.');
    return payload.email;
}

/* ------------------------------------------------------------------ */
/* Gmail API                                                            */
/* ------------------------------------------------------------------ */

export interface GmailAuth {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scope: string;
    clientId: string;
}

export interface GmailMessageListItem {
    id: string;
    threadId?: string;
}

export interface GmailRawMessage {
    id: string;
    threadId?: string;
    internalDate?: string;
    snippet?: string;
    payload?: {
        headers?: { name?: string; value?: string }[];
        body?: { data?: string };
        parts?: GmailRawPart[];
    };
}

export interface GmailRawPart {
    mimeType?: string;
    body?: { data?: string };
    parts?: GmailRawPart[];
}

export function decodeBase64Url(data?: string): string {
    if (!data) return '';
    try {
        const padded = data.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        return new TextDecoder('utf-8').decode(bytes);
    } catch {
        return '';
    }
}

export function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function collectParts(parts: GmailRawPart[] | undefined, mimeType: string, out: string[]): void {
    if (!parts) return;
    for (const part of parts) {
        if (part.mimeType === mimeType && part.body?.data) {
            out.push(decodeBase64Url(part.body.data));
        } else if (part.parts) {
            collectParts(part.parts, mimeType, out);
        }
    }
}

export interface GmailParsedMessage {
    gmailId: string;
    threadId?: string;
    from: string;
    fromEmail: string;
    to?: string;
    subject: string;
    snippet: string;
    body: string;
    receivedAt: number;
}

export function headerValue(headers: { name?: string; value?: string }[] | undefined, name: string): string {
    const found = (headers || []).find(header => (header.name || '').toLowerCase() === name.toLowerCase());
    return (found?.value || '').trim();
}

export function extractEmailAddress(value: string): string {
    const angle = value.match(/<([^>]+)>/);
    if (angle) return angle[1].trim().toLowerCase();
    const bare = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return bare ? bare[0].toLowerCase() : value.trim().toLowerCase();
}

export function parseGmailMessage(raw: GmailRawMessage): GmailParsedMessage {
    const headers = raw.payload?.headers;
    const from = headerValue(headers, 'From');
    const to = headerValue(headers, 'To');
    const subject = headerValue(headers, 'Subject');
    const dateHeader = headerValue(headers, 'Date');

    const plain: string[] = [];
    collectParts(raw.payload?.parts, 'text/plain', plain);
    const html: string[] = [];
    collectParts(raw.payload?.parts, 'text/html', html);

    let body = plain.join('\n\n').trim();
    if (!body) {
        const inline = decodeBase64Url(raw.payload?.body?.data);
        body = inline && /<[a-z]/i.test(inline) ? stripHtml(inline) : inline;
    }
    if (!body && html.length) body = stripHtml(html.join('\n\n'));

    const parsedDate = dateHeader ? new Date(dateHeader).getTime() : NaN;
    const receivedAt = Number.isFinite(parsedDate)
        ? parsedDate
        : raw.internalDate ? Number(raw.internalDate) : Date.now();

    return {
        gmailId: raw.id,
        threadId: raw.threadId,
        from,
        fromEmail: extractEmailAddress(from),
        to: to || undefined,
        subject,
        snippet: raw.snippet || body.slice(0, 140),
        body: body.slice(0, 12000),
        receivedAt,
    };
}

/**
 * Builds the Gmail search for a set of learner addresses.
 * Gmail treats `{a@b.com c@d.com}` as "from any of these".
 */
export function buildLearnerQuery(emails: string[], options: { days?: number } = {}): string {
    const days = Math.max(1, Math.min(365, options.days ?? 60));
    const addresses = Array.from(new Set(emails.map(email => email.trim().toLowerCase()).filter(Boolean)));
    if (addresses.length === 0) return '';
    const from = addresses.length === 1
        ? `from:${addresses[0]}`
        : `from:{${addresses.join(' ')}}`;
    return `${from} newer_than:${days}d`;
}

async function gmailFetch<T>(auth: GmailAuth, path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${GMAIL_API}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${auth.accessToken}`,
            ...(init?.headers || {}),
        },
    });
    if (response.status === 401) {
        throw new AppError('AUTH', 'The Gmail connection expired. Reconnect it in Settings.');
    }
    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new AppError('AUTH', `Gmail request failed (${response.status}). ${detail.slice(0, 200)}`);
    }
    return response.json() as Promise<T>;
}

export async function fetchGmailMessageList(
    auth: GmailAuth,
    query: string,
    maxResults = 40,
): Promise<GmailMessageListItem[]> {
    const params = new URLSearchParams({ maxResults: String(maxResults) });
    if (query) params.set('q', query);
    const payload = await gmailFetch<{ messages?: GmailMessageListItem[] }>(
        auth,
        `/messages?${params.toString()}`,
    );
    return payload.messages || [];
}

export async function fetchGmailMessage(auth: GmailAuth, gmailId: string): Promise<GmailRawMessage> {
    return gmailFetch<GmailRawMessage>(auth, `/messages/${encodeURIComponent(gmailId)}?format=full`);
}

/* ------------------------------------------------------------------ */
/* Matching learners                                                    */
/* ------------------------------------------------------------------ */

export function normalizeEmail(email?: string): string {
    return (email || '').trim().toLowerCase();
}

export async function matchLeadByEmail(workspaceId: string, email: string): Promise<Lead | undefined> {
    const target = normalizeEmail(email);
    if (!target) return undefined;
    const leads = await db.leads.where('workspaceId').equals(workspaceId).toArray();
    return leads.find(lead => {
        if (lead.archived) return false;
        if ((lead.audience || 'learner') !== 'learner') return false;
        return normalizeEmail(lead.email) === target;
    });
}

export async function listLearnerEmails(workspaceId: string): Promise<{ lead: Lead; email: string }[]> {
    const leads = await db.leads.where('workspaceId').equals(workspaceId).toArray();
    const seen = new Set<string>();
    const result: { lead: Lead; email: string }[] = [];
    for (const lead of leads) {
        if (lead.archived) continue;
        if ((lead.audience || 'learner') !== 'learner') continue;
        const email = normalizeEmail(lead.email);
        if (!email || seen.has(email)) continue;
        seen.add(email);
        result.push({ lead, email });
    }
    return result;
}

/* ------------------------------------------------------------------ */
/* Progress detection                                                   */
/* ------------------------------------------------------------------ */

export interface GmailExtraction {
    track?: string;
    tracks: string[];
    whyStarted?: string;
    whereStuck?: string;
    stuckCategory?: StuckCategory;
    fdeHelpRating?: number;
    question?: string;
    consentToContact: boolean;
}

export interface GmailClassification {
    signal: GmailSignal;
    confidence: number;
    extracted: GmailExtraction;
    reasons: string[];
}

const CHALLENGE_PATTERN = /\b(i(?:'| a)?ve?\s+(?:submitted|completed|finished|solved|done)|here(?:'s| is) my|my (?:solution|attempt|answer|code)|submitted|finished (?:the|my|it)|completed (?:the|my|it)|solved (?:the|my|it)|pushing (?:my|the))\b/i;
const FEEDBACK_PATTERN = /\b(feedback|stuck|struggl\w*|difficulty|rating|rate[d]? (?:it|this|algo)|out of 5|\/\s*5|clarity|confusing|recommend\w*|content gap|not seeing the value)\b/i;
const MEETING_PATTERN = /\b(let'?s|can we|could we|schedule|scheduling|meet|meeting|call|calendar|slot|available|appointment|coffee|chat)\b/i;
const QUESTION_PATTERN = /\b(how do i|how can i|can you|could you|help me|i'?m not sure|not sure how|any idea|why does|why is|what'?s the|need help)\b/i;

const STUCK_KEYWORDS: { category: StuckCategory; pattern: RegExp }[] = [
    { category: 'setup', pattern: /\b(install|installing|setup|set up|environment|config|docker|permission|not working|error)\b/i },
    { category: 'concepts', pattern: /\b(concept\w*|unclear|didn'?t understand|did not understand|confusing|not sure why|lost)\b/i },
    { category: 'difficulty', pattern: /\b(hard|difficult|tough|too hard|difficulty jump|struggl\w*)\b/i },
    { category: 'time', pattern: /\b(no time|busy|deadline|exams?|workload|time ?sink)\b/i },
    { category: 'value', pattern: /\b(no value|not seeing the value|why (?:should i|do i)|waste of time)\b/i },
    { category: 'motivation', pattern: /\b(motivation|lost interest|gave up|quitting|not feeling)\b/i },
    { category: 'bug', pattern: /\b(bug|broken|crash\w*|not working correctly|typo)\b/i },
];

export function findTracks(text: string): string[] {
    const haystack = text.toLowerCase();
    const found: string[] = [];
    for (const track of ALGO_TRACK_SUGGESTIONS) {
        const variants = [track.toLowerCase(), track.toLowerCase().replace(/\s*&\s*/g, ' and ')];
        if (variants.some(variant => haystack.includes(variant))) {
            found.push(track);
        }
    }
    if (found.length === 0) {
        const match = text.match(/\b(?:track|module|chapter|exercise)\s+([\w+#.& -]{3,40})/i);
        if (match) found.push(match[1].trim().replace(/\s+/g, ' '));
    }
    return Array.from(new Set(found)).slice(0, 6);
}

export function findRating(text: string): number | undefined {
    const match = text.match(/(\d(?:\.\d)?)\s*(?:\/|out of)\s*5\b/i);
    if (!match) return undefined;
    const value = Math.round(Number(match[1]));
    if (!Number.isFinite(value)) return undefined;
    return Math.min(5, Math.max(1, value));
}

export function findStuckCategory(text: string): StuckCategory | undefined {
    for (const entry of STUCK_KEYWORDS) {
        if (entry.pattern.test(text)) return entry.category;
    }
    return undefined;
}

function firstSentenceContaining(text: string, pattern: RegExp): string | undefined {
    const sentences = text.split(/(?<=[.!?])\s+|\n+/).map(part => part.trim()).filter(Boolean);
    const found = sentences.find(sentence => pattern.test(sentence));
    return found ? found.slice(0, 300) : undefined;
}

export function findWhyStarted(text: string): string | undefined {
    return firstSentenceContaining(text, /\b(because|started .*\bto|want(?:ed)? to|i'?m here to|motivation|so that|hoping to)\b/i);
}

export function findQuestion(text: string): string | undefined {
    const explicit = text.match(/([^\n.!?]{10,220}\?)/);
    if (explicit) return explicit[1].trim().slice(0, 300);
    return firstSentenceContaining(text, QUESTION_PATTERN);
}

/**
 * Reads a learner email and decides what it means for the CRM.
 * Pure and deterministic: no network, no model, no writes.
 */
export function classifyLearnerMessage(input: {
    subject: string;
    body: string;
    lead?: Pick<Lead, 'feedbackStatus' | 'challengeAttempts'> | null;
}): GmailClassification {
    const text = `${input.subject}\n${input.body}`.trim();
    const reasons: string[] = [];
    const tracks = findTracks(text);
    const rating = findRating(text);
    const stuckCategory = findStuckCategory(text);
    const whyStarted = findWhyStarted(text);
    const question = findQuestion(text);
    const consentToContact = /\b(?:you can|feel free|feel free to|happy for you to|ok to|okay to|please)\s+(?:contact|reach out|reach me|email|call|reply|message|get in touch)\b/i.test(text);

    const extracted: GmailExtraction = {
        tracks,
        consentToContact,
    };
    if (tracks.length > 0) extracted.track = tracks[0];
    if (rating !== undefined) extracted.fdeHelpRating = rating;
    if (stuckCategory) extracted.stuckCategory = stuckCategory;
    if (whyStarted) extracted.whyStarted = whyStarted;
    if (question) extracted.question = question;

    const awaitingFeedback = input.lead?.feedbackStatus === 'requested';

    if (CHALLENGE_PATTERN.test(text) && (tracks.length > 0 || /challenge|attempt|exercise/i.test(text))) {
        reasons.push('Mentions a completed attempt or submission.');
        if (tracks.length > 0) reasons.push(`Track mentioned: ${tracks[0]}.`);
        return { signal: 'challenge', confidence: tracks.length > 0 ? 0.9 : 0.72, extracted, reasons };
    }

    if (awaitingFeedback || FEEDBACK_PATTERN.test(text)) {
        if (awaitingFeedback) reasons.push('Feedback was requested for this learner.');
        if (FEEDBACK_PATTERN.test(text)) reasons.push('Mentions difficulty, rating or feedback.');
        if (rating !== undefined) reasons.push(`FDE help rating found: ${rating}/5.`);
        if (stuckCategory) reasons.push(`Likely stuck on: ${stuckCategory}.`);
        return { signal: 'feedback', confidence: awaitingFeedback ? 0.82 : 0.68, extracted, reasons };
    }

    if (MEETING_PATTERN.test(text)) {
        reasons.push('Asks for a call, meeting or a slot.');
        return { signal: 'meeting', confidence: 0.62, extracted, reasons };
    }

    if (QUESTION_PATTERN.test(text) || /\?/.test(input.body)) {
        reasons.push('Asks a question that needs an answer.');
        return { signal: 'question', confidence: 0.6, extracted, reasons };
    }

    reasons.push('No progress signal detected.');
    return { signal: 'other', confidence: 0.3, extracted, reasons };
}

export function summarizeMessage(message: Pick<GmailMessage, 'subject' | 'snippet' | 'body'>): string {
    const source = (message.body || message.snippet || '').replace(/\s+/g, ' ').trim();
    return source.length > 240 ? `${source.slice(0, 237)}…` : source;
}
