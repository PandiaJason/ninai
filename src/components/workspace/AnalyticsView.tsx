import React from 'react';
import { getAlgoAnalytics, type FunnelStep, type StageCount } from '../../services/analytics';
import { Badge, Button, EmptyState, PageHeader, SectionCard, StatCard } from '../ui/Misc';
import { Icon } from '../ui/Icon';
import { DataState } from './shared';
import { useAsyncData } from './useAsyncData';
import type { WorkspaceNav } from '../../types/workspace';

interface AnalyticsViewProps {
    workspaceId: string;
    nav: WorkspaceNav;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ workspaceId, nav }) => {
    const { data, loading, error, reload } = useAsyncData(() => getAlgoAnalytics(workspaceId), [workspaceId]);

    if (!data) {
        return <div className="ws-module"><div className="ws-module-inner"><DataState loading={loading} error={error} onRetry={() => void reload()} /></div></div>;
    }

    const { learners, institutions } = data;
    const maxFunnel = Math.max(1, ...learners.funnel.map(step => step.count));
    const maxSource = Math.max(1, ...learners.sources.map(row => row.total));
    const maxStage = Math.max(1, ...learners.stages.map(row => row.count), ...institutions.stages.map(row => row.count));

    return (
        <div className="ws-module">
            <div className="ws-module-inner">
                <PageHeader
                    eyebrow="ALGO insights"
                    title="What is actually working"
                    subtitle="Source quality, activation drop-off and recurring learner feedback. Counts matter more than percentages while the cohort is small."
                    actions={<Button icon="crm" onClick={() => nav.go('crm')}>Open CRM</Button>}
                />

                <div className="ws-grid ws-grid-5" style={{ marginBottom: 16 }}>
                    <StatCard label="Learners" value={learners.total} hint={`${learners.absentSource} without a source`} icon="users" tone="blue" />
                    <StatCard label="Activated" value={learners.activated} hint="At least one challenge attempt" icon="target" tone="green" />
                    <StatCard label="Engaged" value={learners.engaged} hint="3+ attempts or feedback" icon="activity" tone="purple" />
                    <StatCard label="Feedback" value={learners.feedback} hint={`${learners.feedbackCount} structured responses`} icon="message" tone="orange" />
                    <StatCard label="Genuine FDE" value={learners.genuine} hint="Explicit FDE intent" icon="star" tone="green" />
                </div>

                {learners.total === 0 ? (
                    <EmptyState
                        icon="target"
                        title="No learners to analyse yet"
                        description="Add learners from real sources, record challenge attempts and collect structured feedback. Insights will build from those records."
                        action={<Button variant="primary" icon="plus" onClick={() => nav.go('crm')}>Open the learner pipeline</Button>}
                    />
                ) : (
                    <>
                        <div className="ws-grid ws-grid-2" style={{ marginBottom: 16 }}>
                            <SectionCard title="Activation funnel" description="Requested is every learner. Contacted, activated and engaged come from recorded activity, not stage names.">
                                <div className="ws-funnel">
                                    {learners.funnel.map(step => (
                                        <FunnelRow key={step.id} step={step} max={maxFunnel} />
                                    ))}
                                </div>
                                <p className="ws-muted" style={{ marginTop: 12, fontSize: 12 }}>
                                    Small cohort: use the counts to decide who to call next, not to claim statistical significance.
                                </p>
                            </SectionCard>

                            <SectionCard title="Quality mix" description="Stage and quality are separate. An activated generic coding-course seeker is not a quality activation.">
                                <div className="ws-quality-list">
                                    {learners.qualities.map(row => (
                                        <div key={row.quality} className="ws-quality-row">
                                            <div className="ws-quality-top">
                                                <span>{row.label}</span>
                                                <span>{row.total}</span>
                                            </div>
                                            <div className="ws-quality-track">
                                                <span style={{ width: `${learners.total ? (row.total / learners.total) * 100 : 0}%` }} />
                                            </div>
                                            <div className="ws-quality-hint">{row.activated} activated · {row.feedback} feedback</div>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        </div>

                        <SectionCard title="Source quality" description="Which sources produced learners who actually attempted challenges and gave feedback?" className="ws-analytics-card">
                            {learners.sources.length === 0 ? (
                                <EmptyState compact icon="link" title="No source data" description="Add a source to each learner as they arrive." />
                            ) : (
                                <div className="ws-table-wrap">
                                    <table className="ws-table">
                                        <thead>
                                            <tr>
                                                <th>Source</th>
                                                <th>Learners</th>
                                                <th>Activated</th>
                                                <th>Engaged</th>
                                                <th>Feedback</th>
                                                <th>Activation rate</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {learners.sources.map(row => (
                                                <tr key={row.source}>
                                                    <td>
                                                        <div className="cell-title">{row.label}</div>
                                                        <div className="ws-source-bar"><span style={{ width: `${(row.total / maxSource) * 100}%` }} /></div>
                                                    </td>
                                                    <td className="cell-mono">{row.total}</td>
                                                    <td className="cell-mono">{row.activated}</td>
                                                    <td className="cell-mono">{row.engaged}</td>
                                                    <td className="cell-mono">{row.feedback}</td>
                                                    <td><Badge tone={row.activationRate >= 50 ? 'green' : row.activationRate > 0 ? 'orange' : 'neutral'}>{row.activationRate}%</Badge></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </SectionCard>

                        <div className="ws-grid ws-grid-2" style={{ margin: '16px 0' }}>
                            <SectionCard title="Drop-off and stage health" description="Where learners currently sit, plus records that have gone quiet for 14+ days.">
                                <div className="ws-stage-bars">
                                    {learners.stages.map(row => <StageBar key={row.stage.id} row={row} max={maxStage} />)}
                                </div>
                                <div className="ws-analytics-note">
                                    <Icon name="clock" size={14} />
                                    <span><strong>{learners.stalled}</strong> learner{learners.stalled === 1 ? '' : 's'} stalled for 14+ days.</span>
                                </div>
                                {learners.dropOffReasons.length > 0 && (
                                    <div style={{ marginTop: 14 }}>
                                        <div className="ws-subheading">Recorded reasons</div>
                                        {learners.dropOffReasons.map(reason => (
                                            <div key={reason.reason} className="ws-reason-row">
                                                <span>{reason.reason}</span>
                                                <strong>{reason.count}</strong>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </SectionCard>

                            <SectionCard title="Recurring feedback themes" description="Only themes that were explicitly tagged in structured feedback appear here.">
                                {learners.feedbackCount === 0 ? (
                                    <EmptyState compact icon="message" title="No structured feedback yet" description="Record feedback from activated learners. This is the success stage for the first cohort." />
                                ) : (
                                    <>
                                        <div className="ws-analytics-note">
                                            <Icon name="star" size={14} />
                                            <span>Average FDE help rating: <strong>{learners.averageRating}/5</strong> across {learners.feedbackCount} response{learners.feedbackCount === 1 ? '' : 's'}.</span>
                                        </div>
                                        <div className="ws-theme-bars">
                                            {learners.themes.length === 0 ? <p className="ws-muted">No themes tagged yet.</p> : learners.themes.map(theme => (
                                                <BarRow key={theme.theme} label={theme.label} count={theme.count} total={learners.feedbackCount} />
                                            ))}
                                            {learners.stuck.map(item => (
                                                <BarRow key={item.category} label={item.label} count={item.count} total={learners.feedbackCount} tone="orange" />
                                            ))}
                                        </div>
                                        {learners.tracks.length > 0 && (
                                            <div style={{ marginTop: 14 }}>
                                                <div className="ws-subheading">Tracks explored</div>
                                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                                                    {learners.tracks.map(track => <Badge key={track.track} tone="blue">{track.track} · {track.count}</Badge>)}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </SectionCard>
                        </div>
                    </>
                )}

                <SectionCard title="Institution pipeline" description="Discovery and pilots only. There is no confirmed institution offer, so no proposal stage.">
                    <div className="ws-grid ws-grid-3" style={{ marginBottom: 14 }}>
                        <StatCard label="Institutions" value={institutions.total} icon="building" tone="blue" />
                        <StatCard label="Pilots" value={institutions.pilots} hint="Pilot agreed or running" icon="target" tone="orange" />
                        <StatCard label="Partners" value={institutions.partners} hint="Signed partnership" icon="circle-check" tone="green" />
                    </div>
                    {institutions.total === 0 ? (
                        <EmptyState compact icon="building" title="No institutions yet" description="Add a college or training institute to start discovery conversations." action={<Button size="sm" icon="plus" onClick={() => nav.go('crm')}>Open institutions</Button>} />
                    ) : (
                        <div className="ws-stage-bars">
                            {institutions.stages.map(row => <StageBar key={row.stage.id} row={row} max={maxStage} />)}
                        </div>
                    )}
                </SectionCard>
            </div>
        </div>
    );
};

const FunnelRow: React.FC<{ step: FunnelStep; max: number }> = ({ step, max }) => (
    <div className="ws-funnel-row">
        <div className="ws-funnel-label"><span>{step.label}</span><strong>{step.count}</strong></div>
        <div className="ws-funnel-track">
            <span style={{ width: `${(step.count / max) * 100}%` }} />
        </div>
        <div className="ws-funnel-rate">{step.rate}% of learners</div>
    </div>
);

const StageBar: React.FC<{ row: StageCount; max: number }> = ({ row, max }) => (
    <div className="ws-stage-bar-row">
        <span>{row.stage.name}</span>
        <div className="ws-stage-bar-track"><span style={{ width: `${(row.count / max) * 100}%`, background: row.stage.color }} /></div>
        <strong>{row.count}</strong>
    </div>
);

const BarRow: React.FC<{ label: string; count: number; total: number; tone?: 'blue' | 'orange' }> = ({ label, count, total, tone = 'blue' }) => (
    <div className="ws-theme-row">
        <div className="ws-theme-top"><span>{label}</span><strong>{count}</strong></div>
        <div className={`ws-theme-track ${tone}`}><span style={{ width: `${total ? (count / total) * 100 : 0}%` }} /></div>
    </div>
);
