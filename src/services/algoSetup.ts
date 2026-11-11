import { db } from '../db';
import { ensureAlgoPipelines } from './algo';
import { requireAdmin } from './permissions';
import { addProjectMilestone, createProject } from './projects';
import { createTask } from './tasks';
import { createFollowUp } from './followUps';
import { createWorkspaceNote, linkNote } from './notes';

function dateAfter(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export interface AlgoTemplateResult {
    projectId?: string;
    createdProject: boolean;
}

/**
 * Applies the ALGO pipelines and creates the shared first-cohort operating
 * project. The project is the CMO/founder workspace: milestones, tasks, notes
 * and follow-ups all live on it.
 */
export async function applyAlgoTemplate(workspaceId: string): Promise<AlgoTemplateResult> {
    const actor = await requireAdmin();
    await ensureAlgoPipelines(workspaceId);

    const existing = (await db.projects.where('workspaceId').equals(workspaceId).toArray())
        .find(project => project.identifier === 'ALGO-GTM' || project.name === 'ALGO — First Cohort');
    if (existing) return { projectId: existing.id, createdProject: false };

    const project = await createProject(workspaceId, {
        name: 'ALGO — First Cohort',
        identifier: 'ALGO-GTM',
        description: 'Shared operating space for the first ALGO cohort: source experiments, activation, learner feedback and the institution pipeline.',
        status: 'in_progress',
        priority: 'high',
        startDate: dateAfter(0),
        endDate: dateAfter(30),
        objectives: [
            'Bring in serious, FDE-intent learners rather than raw sign-ups.',
            'Get the first cohort to attempt challenges, not just request access.',
            'Collect structured feedback from at least 10 activated learners.',
            'Use feedback to decide the next product and institution move.',
        ],
    });

    const milestones = [
        { title: 'Outreach live across LinkedIn, X and communities', dueDate: dateAfter(5) },
        { title: 'First cohort review: 20 learners activated', dueDate: dateAfter(14) },
        { title: '10 structured feedback conversations completed', dueDate: dateAfter(21) },
        { title: 'Feedback synthesis and next-step decision', dueDate: dateAfter(30) },
    ];
    for (const milestone of milestones) {
        await addProjectMilestone(project.id, milestone);
    }

    const tasks = [
        {
            title: 'Publish the early-access call on LinkedIn and X',
            description: 'Lead with the FDE practice promise, not “learn to code”. Link the early-access request and tag the first cohort.',
            dueDate: dateAfter(3),
            priority: 'high' as const,
        },
        {
            title: 'Invite 50 final-year students and recent graduates',
            description: 'Work the learner list by source. Record every source in CRM and mark genuine FDE intent.',
            dueDate: dateAfter(7),
            priority: 'high' as const,
        },
        {
            title: 'Review activation daily and follow up with stalled learners',
            description: 'Activation means at least one challenge attempt. Contact learners who requested access but never attempted.',
            dueDate: dateAfter(10),
            priority: 'high' as const,
        },
        {
            title: 'Interview the first 10 activated learners',
            description: 'Use the structured feedback form for every interview. Capture why they started, where they got stuck and whether ALGO helps FDE prep.',
            dueDate: dateAfter(18),
            priority: 'high' as const,
        },
        {
            title: 'Synthesise feedback themes and decide the next move',
            description: 'Review source quality, drop-off points and recurring themes in Insights. Decide one product change and one institution experiment.',
            dueDate: dateAfter(28),
            priority: 'medium' as const,
        },
        {
            title: 'Build the first institution discovery list',
            description: 'Identify 10 engineering colleges or training institutes with placement-cell contacts. This is discovery only; the institutional offer is not defined yet.',
            dueDate: dateAfter(21),
            priority: 'medium' as const,
        },
    ];
    for (const task of tasks) {
        await createTask(workspaceId, {
            ...task,
            projectId: project.id,
            assigneeId: actor.id,
            status: 'todo',
        });
    }

    await createFollowUp(workspaceId, {
        entityType: 'project',
        entityId: project.id,
        title: 'First cohort review with the founder',
        notes: 'Review activation, source quality, feedback themes and the institution discovery list.',
        channel: 'meeting',
        dueAt: Date.now() + 30 * 86_400_000,
        assignedTo: actor.id,
    });

    const note = await createWorkspaceNote(workspaceId, {
        title: 'ALGO — First Cohort working note',
        content: [
            '# ALGO — First Cohort',
            '',
            '## The goal',
            'A first cohort of serious, engaged learners who give honest feedback. Not raw traffic, followers or sign-ups.',
            '',
            '## Working definitions',
            '- **Activated**: attempted at least one challenge, not merely signed in.',
            '- **Engaged**: 3+ challenge attempts, or repeated activity across tracks.',
            '- **Feedback**: structured feedback submitted, even if the learner stopped.',
            '- **Genuine FDE intent**: wants to do the work of a Forward Deployed Engineer.',
            '',
            '## Weekly review',
            '1. Which sources produced activated learners?',
            '2. Where did learners stop, and why?',
            '3. What feedback theme appeared more than once?',
            '4. What is the one change we will make next week?',
            '',
            '## Institution pipeline',
            'Discovery only for now. Do not promise a programme or price until the learner cohort shows what works.',
        ].join('\n'),
    });
    await linkNote(workspaceId, note.id, 'project', project.id);

    return { projectId: project.id, createdProject: true };
}
