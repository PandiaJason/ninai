import { AppError } from './errors';
import type { Lead, LeadAudience, LeadQuality, LearnerPersona, Priority } from '../db';

const TOKEN_KEY = 'ninai_auth_token';

// Base API URL supports both Vite dev proxy (/api) and direct host in Electron/preview
const API_BASE = (typeof window !== 'undefined' && window.location.port === '5173')
  ? '/api'
  : 'http://localhost:3001/api';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err: any) {
    throw new AppError('NETWORK', 'Unable to reach backend API. Is the server running?');
  }

  let data: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json().catch(() => null);
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearAuthToken();
      throw new AppError('AUTH', data?.error || 'Session expired. Please sign in again.');
    }
    throw new AppError('API', data?.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}

// ----------------------------------------------------------------------------
// Stage <-> Status bidirectional mapping
// ----------------------------------------------------------------------------
export const STATUS_TO_STAGE: Record<string, string> = {
  new: 'stage_requested',
  contacted: 'stage_invited',
  early_access: 'stage_activated',
  replied: 'stage_engaged',
  feedback_given: 'stage_feedback',
  active: 'stage_nurture',
  dropped: 'stage_not_fit',
};

export const STAGE_TO_STATUS: Record<string, string> = {
  stage_requested: 'new',
  stage_invited: 'contacted',
  stage_activated: 'early_access',
  stage_engaged: 'replied',
  stage_feedback: 'feedback_given',
  stage_nurture: 'active',
  stage_not_fit: 'dropped',
  // Inst stage fallbacks
  inst_stage_prospect: 'new',
  inst_stage_contacted: 'contacted',
  inst_stage_discovery: 'replied',
  inst_stage_pilot_agreed: 'early_access',
  inst_stage_pilot_running: 'active',
  inst_stage_partner: 'feedback_given',
  inst_stage_not_now: 'dropped',
};

export function stageToStatus(stageId?: string): string {
  if (!stageId) return 'new';
  return STAGE_TO_STATUS[stageId] || (stageId in STATUS_TO_STAGE ? stageId : 'new');
}

export function statusToStage(status?: string): string {
  if (!status) return 'stage_requested';
  return STATUS_TO_STAGE[status] || 'stage_requested';
}

// ----------------------------------------------------------------------------
// Lead Data Adapter: Transforms Postgres rows into Frontend Lead models
// ----------------------------------------------------------------------------
export function mapDbLeadToModel(row: any, workspaceId = 'ws_default'): Lead {
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : createdAt;
  const nextFollowUpAt = row.next_follow_up_at ? new Date(row.next_follow_up_at).getTime() : undefined;
  const lastContactedAt = row.last_contacted_at ? new Date(row.last_contacted_at).getTime() : undefined;
  const firstChallengeAt = row.first_challenge_at ? new Date(row.first_challenge_at).getTime() : undefined;
  const lastActiveAt = row.last_active_at ? new Date(row.last_active_at).getTime() : undefined;

  let tracksExplored: string[] | undefined = undefined;
  if (row.tracks_explored) {
    tracksExplored = Array.isArray(row.tracks_explored)
      ? row.tracks_explored
      : typeof row.tracks_explored === 'string'
      ? JSON.parse(row.tracks_explored)
      : undefined;
  }

  return {
    id: row.id,
    workspaceId,
    name: row.name,
    company: row.company || (row.contact && !row.contact.includes('@') ? row.contact : undefined),
    email: row.email || (row.contact && row.contact.includes('@') ? row.contact : undefined),
    phone: row.phone || undefined,
    website: row.website || undefined,
    jobTitle: row.job_title || undefined,
    source: row.source || 'direct',
    sourceDetail: row.source_detail || undefined,
    industry: row.industry || undefined,
    location: row.location || undefined,
    ownerId: row.owner_id,
    stageId: statusToStage(row.status),
    priority: (row.priority as Priority) || 'medium',
    value: Number(row.value) || 0,
    description: row.description || undefined,
    createdAt,
    updatedAt,
    lastContactedAt,
    nextFollowUpAt,
    archived: row.archived ? 1 : 0,
    createdBy: row.owner_id,
    audience: (row.audience as LeadAudience) || 'learner',
    persona: (row.persona as LearnerPersona) || undefined,
    quality: (row.quality as LeadQuality) || undefined,
    firstChallengeAt,
    challengeAttempts: row.challenge_attempts ?? 0,
    tracksExplored,
    lastActiveAt,
    feedbackStatus: row.feedback_status || 'not_requested',
    dropOffReason: row.drop_off_reason || undefined,
    institutionType: row.institution_type || undefined,
    studentCount: row.student_count ?? undefined,
  };
}
