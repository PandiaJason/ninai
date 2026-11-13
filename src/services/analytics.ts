import {
    db,
    type FeedbackTheme,
    type Lead,
    type LeadQuality,
    type LeadStage,
    type StuckCategory,
} from '../db';
import {
    FEEDBACK_THEME_LABEL,
    FEEDBACK_THEMES,
    LEAD_QUALITIES,
    LEAD_QUALITY_LABEL,
    STUCK_CATEGORIES,
    STUCK_CATEGORY_LABEL,
    normalizeSource,
    sourceLabel,
    stagesForAudience,
} from './algo';
import { requireUser } from './auth';
import { assertWorkspaceAccess } from './permissions';

export interface FunnelStep {
    id: string;
    label: string;
    count: number;
    rate: number;
}

export interface SourceRow {
    source: string;
    label: string;
    total: number;
    activated: number;
    engaged: number;
    feedback: number;
    activationRate: number;
    feedbackRate: number;
}

export interface QualityRow {
    quality: LeadQuality | 'unclassified';
    label: string;
    total: number;
    activated: number;
    feedback: number;
}

export interface StageCount {
    stage: LeadStage;
    count: number;
}

export interface ThemeCount {
    theme: FeedbackTheme;
    label: string;
    count: number;
}

export interface StuckCount {
    category: StuckCategory;
    label: string;
    count: number;
}

export interface TrackCount {
    track: string;
    count: number;
}

export interface LearnerAnalytics {
    total: number;
    activated: number;
    engaged: number;
    feedback: number;
    genuine: number;
    stalled: number;
    absentSource: number;
    averageRating: number;
    feedbackCount: number;
    funnel: FunnelStep[];
    sources: SourceRow[];
    qualities: QualityRow[];
    stages: StageCount[];
    dropOffReasons: { reason: string; count: number }[];
    themes: ThemeCount[];
    stuck: StuckCount[];
    tracks: TrackCount[];
}

export interface InstitutionAnalytics {
    total: number;
    partners: number;
    pilots: number;
    stages: StageCount[];
}

export interface AlgoAnalytics {
    learners: LearnerAnalytics;
    institutions: InstitutionAnalytics;
}

function rate(part: number, total: number): number {
    return total > 0 ? Math.round((part / total) * 100) : 0;
}

function audienceOf(lead: Lead): 'learner' | 'institution' {
    return lead.audience === 'institution' ? 'institution' : 'learner';
}

export async function getAlgoAnalytics(workspaceId: string): Promise<AlgoAnalytics> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);

    const [allLeads, allStages, allFeedback] = await Promise.all([
        db.leads.where('workspaceId').equals(workspaceId).toArray(),
        db.leadStages.where('workspaceId').equals(workspaceId).toArray(),
        db.learnerFeedback.where('workspaceId').equals(workspaceId).toArray(),
    ]);

    const leads = allLeads.filter(lead => !lead.archived);
    const learnerLeads = leads.filter(lead => audienceOf(lead) === 'learner');
    const institutionLeads = leads.filter(lead => audienceOf(lead) === 'institution');
    const learnerStages = stagesForAudience(allStages, 'learner');
    const institutionStages = stagesForAudience(allStages, 'institution');
    const stageMap = new Map(allStages.map(stage => [stage.id, stage]));
    const feedbackByLead = new Map(allFeedback.map(feedback => [feedback.leadId, feedback]));

    const stageName = (lead: Lead) => (stageMap.get(lead.stageId)?.name || '').trim().toLowerCase();
    const isFeedback = (lead: Lead) => !!feedbackByLead.get(lead.id) || lead.feedbackStatus === 'submitted';
    const isActivated = (lead: Lead) =>
        !!lead.firstChallengeAt || (lead.challengeAttempts || 0) > 0 || isFeedback(lead);
    const isEngaged = (lead: Lead) =>
        (lead.challengeAttempts || 0) >= 3
        || isFeedback(lead)
        || ['engaged', 'feedback'].includes(stageName(lead));
    const isContacted = (lead: Lead) =>
        !!lead.lastContactedAt
        || isActivated(lead)
        || ['invited', 'activated', 'engaged', 'feedback', 'nurture'].includes(stageName(lead));

    const activated = learnerLeads.filter(isActivated).length;
    const engaged = learnerLeads.filter(isEngaged).length;
    const feedback = learnerLeads.filter(isFeedback).length;
    const genuine = learnerLeads.filter(lead => lead.quality === 'genuine').length;
    const staleBefore = Date.now() - 14 * 86_400_000;
    const stalled = learnerLeads.filter(lead => {
        const stage = stageMap.get(lead.stageId);
        if (stage?.isWon || stage?.isLost) return false;
        const lastTouch = Math.max(lead.lastActiveAt || 0, lead.lastContactedAt || 0, lead.updatedAt || 0);
        return !!lastTouch && lastTouch < staleBefore;
    }).length;

    const funnel: FunnelStep[] = [
        { id: 'requested', label: 'Requested', count: learnerLeads.length, rate: 100 },
        { id: 'contacted', label: 'Contacted / invited', count: learnerLeads.filter(isContacted).length, rate: rate(learnerLeads.filter(isContacted).length, learnerLeads.length) },
        { id: 'activated', label: 'Activated', count: activated, rate: rate(activated, learnerLeads.length) },
        { id: 'engaged', label: 'Engaged', count: engaged, rate: rate(engaged, learnerLeads.length) },
        { id: 'feedback', label: 'Feedback given', count: feedback, rate: rate(feedback, learnerLeads.length) },
    ];

    const sourceMap = new Map<string, Lead[]>();
    for (const lead of learnerLeads) {
        const key = normalizeSource(lead.source) || 'unknown';
        const list = sourceMap.get(key) || [];
        list.push(lead);
        sourceMap.set(key, list);
    }
    const sources: SourceRow[] = Array.from(sourceMap.entries())
        .map(([source, items]) => {
            const sourceActivated = items.filter(isActivated).length;
            const sourceEngaged = items.filter(isEngaged).length;
            const sourceFeedback = items.filter(isFeedback).length;
            return {
                source,
                label: source === 'unknown' ? 'No source' : sourceLabel(source),
                total: items.length,
                activated: sourceActivated,
                engaged: sourceEngaged,
                feedback: sourceFeedback,
                activationRate: rate(sourceActivated, items.length),
                feedbackRate: rate(sourceFeedback, items.length),
            };
        })
        .sort((a, b) => b.feedback - a.feedback || b.engaged - a.engaged || b.total - a.total);

    const qualities: QualityRow[] = [
        ...LEAD_QUALITIES.map(quality => {
            const items = learnerLeads.filter(lead => lead.quality === quality.id);
            return {
                quality: quality.id,
                label: LEAD_QUALITY_LABEL[quality.id],
                total: items.length,
                activated: items.filter(isActivated).length,
                feedback: items.filter(isFeedback).length,
            };
        }),
        {
            quality: 'unclassified' as const,
            label: 'Unclassified',
            total: learnerLeads.filter(lead => !lead.quality).length,
            activated: learnerLeads.filter(lead => !lead.quality && isActivated(lead)).length,
            feedback: learnerLeads.filter(lead => !lead.quality && isFeedback(lead)).length,
        },
    ];

    const stageCounts = (items: Lead[], stages: LeadStage[]): StageCount[] => stages.map(stage => ({
        stage,
        count: items.filter(lead => lead.stageId === stage.id).length,
    }));

    const reasonMap = new Map<string, number>();
    for (const lead of learnerLeads) {
        const reason = lead.dropOffReason?.trim();
        if (!reason) continue;
        reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
    }
    const dropOffReasons = Array.from(reasonMap.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

    const themeMap = new Map<FeedbackTheme, number>();
    const stuckMap = new Map<StuckCategory, number>();
    const trackMap = new Map<string, number>();
    for (const item of allFeedback) {
        for (const theme of item.themes || []) themeMap.set(theme, (themeMap.get(theme) || 0) + 1);
        stuckMap.set(item.stuckCategory, (stuckMap.get(item.stuckCategory) || 0) + 1);
        for (const track of item.tracksExplored || []) trackMap.set(track, (trackMap.get(track) || 0) + 1);
    }
    const themes: ThemeCount[] = FEEDBACK_THEMES
        .map(theme => ({ theme: theme.id, label: FEEDBACK_THEME_LABEL[theme.id], count: themeMap.get(theme.id) || 0 }))
        .filter(item => item.count > 0)
        .sort((a, b) => b.count - a.count);
    const stuck: StuckCount[] = STUCK_CATEGORIES
        .map(category => ({ category: category.id, label: STUCK_CATEGORY_LABEL[category.id], count: stuckMap.get(category.id) || 0 }))
        .filter(item => item.count > 0)
        .sort((a, b) => b.count - a.count);
    const tracks: TrackCount[] = Array.from(trackMap.entries())
        .map(([track, count]) => ({ track, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    const averageRating = allFeedback.length
        ? Math.round((allFeedback.reduce((sum, item) => sum + item.fdeHelpRating, 0) / allFeedback.length) * 10) / 10
        : 0;

    const institutionStagesWithCounts = stageCounts(institutionLeads, institutionStages);
    const partners = institutionLeads.filter(lead => stageMap.get(lead.stageId)?.isWon === 1).length;
    const pilots = institutionLeads.filter(lead => stageName(lead).includes('pilot')).length;

    return {
        learners: {
            total: learnerLeads.length,
            activated,
            engaged,
            feedback,
            genuine,
            stalled,
            absentSource: learnerLeads.filter(lead => !lead.source).length,
            averageRating,
            feedbackCount: allFeedback.length,
            funnel,
            sources,
            qualities,
            stages: stageCounts(learnerLeads, learnerStages),
            dropOffReasons,
            themes,
            stuck,
            tracks,
        },
        institutions: {
            total: institutionLeads.length,
            partners,
            pilots,
            stages: institutionStagesWithCounts,
        },
    };
}
