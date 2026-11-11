import {
    db,
    type Lead,
    type LeadStage,
    type Note,
    type Project,
    type Task,
} from '../db';
import { requireUser } from './auth';
import { assertWorkspaceAccess } from './permissions';
import { getCalendarItems, type CalendarItem } from './calendar';
import { listRecentNotes } from './notes';
import { listActivities, type ActivityWithUser } from './activity';
import { listFollowUps, type FollowUpWithMeta } from './followUps';

export interface DashboardStats {
    totalLeads: number;
    newLeads: number;
    qualifiedLeads: number;
    inProgressLeads: number;
    convertedLeads: number;
    pendingTasks: number;
    overdueTasks: number;
    upcomingDeadlines: number;
    myOpenTasks: number;
    pendingFollowUps: number;
    overdueFollowUps: number;
    activeProjects: number;
}

export interface DashboardLead extends Lead {
    stage?: LeadStage;
    ownerName: string;
}

export interface DashboardTask extends Task {
    assigneeName?: string;
}

export interface DashboardProject extends Project {
    ownerName: string;
    ownerColor: string;
}

export interface DashboardData {
    stats: DashboardStats;
    recentLeads: DashboardLead[];
    myTasks: DashboardTask[];
    myFollowUps: FollowUpWithMeta[];
    projects: DashboardProject[];
    upcoming: CalendarItem[];
    recentNotes: Note[];
    activity: ActivityWithUser[];
}

function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getDashboardData(workspaceId: string, userId: string): Promise<DashboardData> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);

    const [leads, stages, tasks, users, workspaceProjects, followUps] = await Promise.all([
        db.leads.where('workspaceId').equals(workspaceId).toArray(),
        db.leadStages.where('workspaceId').equals(workspaceId).sortBy('order'),
        db.tasks.where('workspaceId').equals(workspaceId).toArray(),
        db.users.toArray(),
        db.projects.where('workspaceId').equals(workspaceId).toArray(),
        listFollowUps(workspaceId, { status: 'pending', limit: 50 }),
    ]);

    const activeLeads = leads.filter(l => !l.archived);
    const userMap = new Map(users.map(u => [u.id, u]));
    const stageMap = new Map(stages.map(s => [s.id, s]));

    const newStageIds = new Set(stages.filter(s => s.name.trim().toLowerCase() === 'new' || s.order === 0).map(s => s.id));
    const qualifiedStageIds = new Set(stages.filter(s => s.name.trim().toLowerCase() === 'qualified').map(s => s.id));
    const wonStageIds = new Set(stages.filter(s => s.isWon === 1).map(s => s.id));
    const lostStageIds = new Set(stages.filter(s => s.isLost === 1).map(s => s.id));

    const today = todayKey();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const weekKey = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, '0')}-${String(nextWeek.getDate()).padStart(2, '0')}`;

    const pendingTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
    const overdue = pendingTasks.filter(t => t.dueDate && t.dueDate < today);
    const upcomingTaskCount = pendingTasks.filter(t => t.dueDate && t.dueDate >= today && t.dueDate <= weekKey).length;

    const rangeStart = new Date();
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = rangeStart.getTime() + 7 * 86_400_000 - 1;
    const calendarItems = await getCalendarItems(workspaceId, rangeStart.getTime(), rangeEnd)
        .catch(() => [] as CalendarItem[]);

    const upcomingFollowUps = activeLeads.filter(l => l.nextFollowUpAt && l.nextFollowUpAt >= rangeStart.getTime() && l.nextFollowUpAt <= rangeEnd).length;

    const stats: DashboardStats = {
        totalLeads: activeLeads.length,
        newLeads: activeLeads.filter(l => newStageIds.has(l.stageId)).length,
        qualifiedLeads: activeLeads.filter(l => qualifiedStageIds.has(l.stageId)).length,
        inProgressLeads: activeLeads.filter(l => !newStageIds.has(l.stageId) && !wonStageIds.has(l.stageId) && !lostStageIds.has(l.stageId)).length,
        convertedLeads: activeLeads.filter(l => wonStageIds.has(l.stageId)).length,
        pendingTasks: pendingTasks.length,
        overdueTasks: overdue.length,
        upcomingDeadlines: upcomingTaskCount + upcomingFollowUps,
        myOpenTasks: pendingTasks.filter(t => t.assigneeId === userId).length,
        pendingFollowUps: followUps.length,
        overdueFollowUps: followUps.filter(item => item.overdue).length,
        activeProjects: workspaceProjects.filter(project => !project.archived && project.status !== 'completed' && project.status !== 'cancelled').length,
    };

    const activeProjects: DashboardProject[] = workspaceProjects
        .filter(project => !project.archived && project.status !== 'completed' && project.status !== 'cancelled')
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 4)
        .map(project => ({
            ...project,
            ownerName: userMap.get(project.ownerId)?.name || 'Unassigned',
            ownerColor: userMap.get(project.ownerId)?.avatarColor || '#8e8e93',
        }));

    const myFollowUps = followUps
        .filter(item => item.assignedTo === userId)
        .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueAt - b.dueAt)
        .slice(0, 5);

    const recentLeads = activeLeads
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5)
        .map(lead => ({
            ...lead,
            stage: stageMap.get(lead.stageId),
            ownerName: userMap.get(lead.ownerId)?.name || 'Unassigned',
        }));

    const myTasks: DashboardTask[] = pendingTasks
        .filter(t => t.assigneeId === userId)
        .sort((a, b) => {
            if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            return b.updatedAt - a.updatedAt;
        })
        .slice(0, 5)
        .map(task => ({
            ...task,
            assigneeName: task.assigneeId ? userMap.get(task.assigneeId)?.name : undefined,
        }));

    const upcoming = calendarItems
        .filter(item => item.startAt >= rangeStart.getTime())
        .sort((a, b) => a.startAt - b.startAt)
        .slice(0, 6);

    const [recentNotes, activity] = await Promise.all([
        listRecentNotes(workspaceId, 4),
        listActivities(workspaceId, 8),
    ]);

    return { stats, recentLeads, myTasks, myFollowUps, projects: activeProjects, upcoming, recentNotes, activity };
}
