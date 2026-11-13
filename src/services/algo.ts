import {
    db,
    DEFAULT_INSTITUTION_STAGES,
    DEFAULT_STAGES,
    DEFAULT_WORKSPACE_ID,
    type FeedbackStatus,
    type FeedbackTheme,
    type LeadAudience,
    type LeadQuality,
    type LeadStage,
    type LearnerPersona,
    type StuckCategory,
} from '../db';

export const LEAD_AUDIENCE_LABEL: Record<LeadAudience, string> = {
    learner: 'Learner',
    institution: 'Institution',
};

export const LEAD_SOURCES: { id: string; label: string }[] = [
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'x', label: 'X / Twitter' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'github', label: 'GitHub' },
    { id: 'reddit', label: 'Reddit' },
    { id: 'product_hunt', label: 'Product Hunt' },
    { id: 'referral', label: 'Referral' },
    { id: 'institution', label: 'Institution' },
    { id: 'event', label: 'Event / community' },
    { id: 'other', label: 'Other' },
];

const SOURCE_ALIASES: Record<string, string> = {
    linkedin: 'linkedin',
    'x / twitter': 'x',
    x: 'x',
    twitter: 'x',
    instagram: 'instagram',
    youtube: 'youtube',
    github: 'github',
    reddit: 'reddit',
    'product hunt': 'product_hunt',
    product_hunt: 'product_hunt',
    referral: 'referral',
    referred: 'referral',
    institution: 'institution',
    college: 'institution',
    event: 'event',
    'event / community': 'event',
    community: 'event',
    other: 'other',
};

export function normalizeSource(value?: string): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return SOURCE_ALIASES[trimmed.toLowerCase()] || trimmed.toLowerCase().replace(/\s+/g, '_');
}

export function sourceLabel(value?: string): string {
    if (!value) return 'Unknown source';
    const normalized = normalizeSource(value) || value;
    return LEAD_SOURCES.find(source => source.id === normalized)?.label || value;
}

export const LEARNER_PERSONAS: { id: LearnerPersona; label: string }[] = [
    { id: 'final_year', label: 'Final-year student' },
    { id: 'recent_grad', label: 'Recent graduate' },
    { id: 'early_career', label: 'Early-career engineer' },
    { id: 'career_switcher', label: 'Career switcher' },
    { id: 'institution', label: 'Institution contact' },
    { id: 'other', label: 'Other' },
];

export const LEARNER_PERSONA_LABEL: Record<LearnerPersona, string> = Object.fromEntries(
    LEARNER_PERSONAS.map(persona => [persona.id, persona.label]),
) as Record<LearnerPersona, string>;

export const LEAD_QUALITIES: { id: LeadQuality; label: string; hint: string }[] = [
    { id: 'genuine', label: 'Genuine FDE intent', hint: 'Wants to do the work of a Forward Deployed Engineer.' },
    { id: 'exploring', label: 'Exploring', hint: 'Curious, still deciding whether FDE is the goal.' },
    { id: 'generic', label: 'Generic coding seeker', hint: 'Looking for DSA or placement prep, not systems/FDE.' },
    { id: 'not_fit', label: 'Not a fit', hint: 'Wrong audience or explicitly not interested.' },
];

export const LEAD_QUALITY_LABEL: Record<LeadQuality, string> = Object.fromEntries(
    LEAD_QUALITIES.map(quality => [quality.id, quality.label]),
) as Record<LeadQuality, string>;

export const LEAD_QUALITY_TONE: Record<LeadQuality, 'green' | 'blue' | 'orange' | 'neutral'> = {
    genuine: 'green',
    exploring: 'blue',
    generic: 'orange',
    not_fit: 'neutral',
};

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
    not_requested: 'Not requested',
    requested: 'Requested',
    submitted: 'Submitted',
};

export const STUCK_CATEGORIES: { id: StuckCategory; label: string }[] = [
    { id: 'setup', label: 'Setup / environment' },
    { id: 'concepts', label: 'Concepts were unclear' },
    { id: 'difficulty', label: 'Difficulty jump' },
    { id: 'time', label: 'No time' },
    { id: 'value', label: 'Did not see the value' },
    { id: 'motivation', label: 'Lost motivation' },
    { id: 'bug', label: 'Bug or broken exercise' },
    { id: 'other', label: 'Other' },
];

export const STUCK_CATEGORY_LABEL: Record<StuckCategory, string> = Object.fromEntries(
    STUCK_CATEGORIES.map(category => [category.id, category.label]),
) as Record<StuckCategory, string>;

export const FEEDBACK_THEMES: { id: FeedbackTheme; label: string }[] = [
    { id: 'clarity', label: 'Clarity' },
    { id: 'difficulty', label: 'Difficulty' },
    { id: 'time', label: 'Time' },
    { id: 'relevance', label: 'FDE relevance' },
    { id: 'bugs', label: 'Bugs' },
    { id: 'content_gap', label: 'Content gap' },
    { id: 'motivation', label: 'Motivation' },
];

export const FEEDBACK_THEME_LABEL: Record<FeedbackTheme, string> = Object.fromEntries(
    FEEDBACK_THEMES.map(theme => [theme.id, theme.label]),
) as Record<FeedbackTheme, string>;

// Suggestions only: learners can add any track name. The product has 20 system
// tracks plus the Coding Prequels track.
export const ALGO_TRACK_SUGGESTIONS = [
    'Coding Prequels',
    'Unix Shell',
    'Git & GitHub',
    'HTTP & APIs',
    'JSON & Serialization',
    'SQL & Databases',
    'Files & Storage',
    'Processes & Concurrency',
    'Networking',
    'Caching',
    'Queues',
    'Rate Limiting',
    'Authentication',
    'Observability',
    'Containers',
    'Kubernetes',
    'Distributed Systems',
    'CI/CD',
    'Cloud Runtime',
    'Incident Response',
    'MCP Tool Runtime',
];

export const INSTITUTION_TYPES = [
    'Engineering college',
    'University',
    'Training institute',
    'Community / cohort',
    'Other',
];

export function stageAudience(stage: Pick<LeadStage, 'audience'> | undefined): LeadAudience {
    return stage?.audience === 'institution' ? 'institution' : 'learner';
}

export function stagesForAudience(stages: LeadStage[], audience: LeadAudience): LeadStage[] {
    return stages
        .filter(stage => stageAudience(stage) === audience)
        .sort((a, b) => a.order - b.order);
}

function oldDefaultBaseId(id: string, workspaceId: string): string {
    return id.endsWith(`_${workspaceId}`) ? id.slice(0, -(workspaceId.length + 1)) : id;
}

function defaultStagesFor(workspaceId: string) {
    const suffix = workspaceId === DEFAULT_WORKSPACE_ID ? '' : `_${workspaceId}`;
    return {
        learner: DEFAULT_STAGES.map(stage => ({ ...stage, id: `${stage.id}${suffix}`, workspaceId })),
        institution: DEFAULT_INSTITUTION_STAGES.map(stage => ({ ...stage, id: `${stage.id}${suffix}`, workspaceId })),
    };
}

/**
 * Makes an existing workspace safe for the ALGO pipelines. This is deliberately
 * idempotent: it does not overwrite custom stages and it only converts the
 * original, untouched default sales pipeline.
 */
export async function ensureAlgoPipelines(workspaceId: string): Promise<void> {
    let stages = await db.leadStages.where('workspaceId').equals(workspaceId).toArray();
    if (stages.length === 0) {
        const defaults = defaultStagesFor(workspaceId);
        await db.leadStages.bulkAdd([...defaults.learner, ...defaults.institution]);
        return;
    }

    const learnerStages = stages.filter(stage => stageAudience(stage) === 'learner');
    const oldDefaults = new Set([
        'stage_new', 'stage_contacted', 'stage_interested', 'stage_qualified',
        'stage_proposal', 'stage_negotiation', 'stage_converted', 'stage_lost',
    ]);
    const isOldDefaultPipeline = learnerStages.length >= 7
        && learnerStages.every(stage => oldDefaults.has(oldDefaultBaseId(stage.id, workspaceId)))
        && learnerStages.some(stage => oldDefaultBaseId(stage.id, workspaceId) === 'stage_new');

    if (isOldDefaultPipeline) {
        const mapping: Record<string, Partial<LeadStage>> = {
            stage_new: { name: 'Requested', color: '#0071e3', order: 0, isWon: 0, isLost: 0 },
            stage_contacted: { name: 'Invited', color: '#5e5ce6', order: 1, isWon: 0, isLost: 0 },
            stage_interested: { name: 'Activated', color: '#30b0c7', order: 2, isWon: 0, isLost: 0 },
            stage_qualified: { name: 'Engaged', color: '#34c759', order: 3, isWon: 0, isLost: 0 },
            stage_proposal: { name: 'Feedback', color: '#30d158', order: 4, isWon: 1, isLost: 0 },
            stage_negotiation: { name: 'Nurture', color: '#ff9f0a', order: 5, isWon: 0, isLost: 0 },
            stage_lost: { name: 'Not fit', color: '#8e8e93', order: 6, isWon: 0, isLost: 1 },
        };
        const converted = learnerStages.find(stage => oldDefaultBaseId(stage.id, workspaceId) === 'stage_converted');
        const feedback = learnerStages.find(stage => oldDefaultBaseId(stage.id, workspaceId) === 'stage_proposal');
        if (converted && feedback && converted.id !== feedback.id) {
            await db.leads.where('stageId').equals(converted.id).modify({ stageId: feedback.id });
            await db.leadStages.delete(converted.id);
        }
        for (const stage of learnerStages) {
            if (stage.id === converted?.id) continue;
            const next = mapping[oldDefaultBaseId(stage.id, workspaceId)];
            if (next) await db.leadStages.update(stage.id, { ...next, audience: 'learner' });
        }
        stages = await db.leadStages.where('workspaceId').equals(workspaceId).toArray();
    } else {
        for (const stage of stages) {
            if (!stage.audience) await db.leadStages.update(stage.id, { audience: 'learner' });
        }
    }

    const hasInstitution = stages.some(stage => stageAudience(stage) === 'institution');
    if (!hasInstitution) {
        const defaults = defaultStagesFor(workspaceId);
        await db.leadStages.bulkAdd(defaults.institution);
    }

    const hasLearner = stages.some(stage => stageAudience(stage) === 'learner');
    if (!hasLearner) {
        const defaults = defaultStagesFor(workspaceId);
        await db.leadStages.bulkAdd(defaults.learner);
    }

    await db.leads.where('workspaceId').equals(workspaceId).modify(lead => {
        if (!lead.audience) lead.audience = 'learner';
        if (lead.challengeAttempts === undefined) lead.challengeAttempts = 0;
        if (!lead.feedbackStatus) lead.feedbackStatus = 'not_requested';
    });
}

export function firstName(name: string): string {
    return name.split(/\s+/)[0] || name;
}
