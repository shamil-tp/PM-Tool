import type { Project, Task, Team, Stats, TaskDependency } from '../../types';
import { calculateExpectedTime } from '../../utils/timeUtils';
import { buildVisibilityContext, filterVisibleProjects, filterVisibleTasks, getVisibleProjectIds } from '../../utils/visibilityFilter';
import type { UserRole } from '../../types';
import type { OperationalDerivedState } from './types';
import { buildLogisticsSystemData } from './systemData';
import type { AttendanceRow, SalaryRow } from './types';

export function computeTeamBandwidth(activeProjects: Project[], activeTeams: Team[]): number {
  const teamsWithProjects = new Set(activeProjects.filter(p => p.team_id).map(p => p.team_id));
  return activeTeams.length > 0
    ? Number(((teamsWithProjects.size / activeTeams.length) * 100).toFixed(1))
    : 0;
}

export interface ComputeDerivedInput {
  projects: Project[];
  tasks: Task[];
  teams: Team[];
  profiles: unknown[];
  attendanceRows: AttendanceRow[];
  
  workspaceSettingsBlob: Record<string, unknown>;
  userId: string;
  userRole: UserRole;
  dependencies?: TaskDependency[];
  serverMetrics?: {
    deliveryConfidence: number;
    executionPressure: number;
    dailyFatigue: number;
    riskForecast: number;
  };
}

export function computeOperationalDerived(input: ComputeDerivedInput): OperationalDerivedState {
  const activeTeams = input.teams.filter(t => t.name !== 'SYSTEM_SETTINGS');
  
  // PERT is now handled mathematically and automatically on the backend via Postgres triggers
  // Fallback frontend predicted_completion calculation for portfolio forecasting if backend hasn't populated it
  const projectsWithPert = input.projects.map(p => {
    if (p.predicted_completion) return p;
    
    // Naive frontend forecast: Start from today, add sum of remaining task estimated hours / 8 days
    const pTasks = input.tasks.filter(t => t.project_id === p.id && t.status !== 'done');
    let remainingHours = 0;
    pTasks.forEach(t => {
      remainingHours += calculateExpectedTime(
        t.pert_best || t.estimated_hours || 0,
        t.pert_likely || t.estimated_hours || 0,
        t.pert_worst || t.estimated_hours || 0,
      );
    });
    
    if (remainingHours <= 0) {
      if (p.client_deadline) {
        return { ...p, predicted_completion: p.client_deadline };
      }
      return p;
    }
    
    // Convert remaining hours to business days (assume 8 hr/day, 1 person)
    const extraDays = Math.ceil(remainingHours / 8);
    const forecastDate = new Date();
    forecastDate.setDate(forecastDate.getDate() + extraDays);
    
    return { ...p, predicted_completion: forecastDate.toISOString() };
  });

  const visibilityContext = buildVisibilityContext(
    input.userId,
    input.userRole,
    input.projects,
    input.teams,
    input.tasks,
    input.dependencies,
    input.workspaceSettingsBlob,
  );

  const visibleTasks = filterVisibleTasks(input.tasks, visibilityContext);
  const visibleProjectIds = getVisibleProjectIds(
    input.projects,
    visibilityContext,
    input.tasks,
  );
  const visibleProjects = filterVisibleProjects(
    input.projects,
    visibilityContext,
    visibleProjectIds,
  );

  const activeProjects = projectsWithPert.filter(p => p.status !== 'deployed' && p.status !== 'done' && p.status !== 'archived');
  const activeWorkflows = activeProjects.filter(p => p.execution_mode !== 'SCRUM');
  const teamBandwidth = computeTeamBandwidth(activeProjects, activeTeams);

  // Read state durations and shift ledger from workspaceSettingsBlob
  const stateDurations = (input.workspaceSettingsBlob?.project_state_durations || {}) as Record<
    string,
    {
      currentState?: 'active' | 'passive_wait' | 'blocked';
      activeDays?: number;
      passiveWaitDays?: number;
      blockedDays?: number;
    }
  >;

  const timelineShiftLedger = (input.workspaceSettingsBlob?.timeline_shift_ledger || []) as any[];

  // 1. Calculate project-level friction metrics
  const projectFrictionMetrics: Record<string, any> = {};
  let totalFrictionImpact = 0;
  let activeProjectCount = 0;
  
  let activeExecutionProjectsCount = 0;
  let passiveWaitingProjectsCount = 0;
  let blockedProjectsCount = 0;

  let sumWaitTimeRatio = 0;
  let sumAdjustedConfidence = 0;
  let sumOperationalContinuity = 0;

  const sumFrictionCategories = {
    blockerRecurrence: 0,
    dependencyInstability: 0,
    clientResponsiveness: 0,
    coordinationOverhead: 0,
    infrastructureReliability: 0,
  };

  const taskSubstates = input.workspaceSettingsBlob?.task_substates || {};
  const globalBlockers = (input.workspaceSettingsBlob?.execution_blockers as any[]) || [];

  // Pre-compute indices for O(1) lookups
  const tasksByProject = new Map<string, any[]>();
  input.tasks.forEach(t => {
    if (!tasksByProject.has(t.project_id)) tasksByProject.set(t.project_id, []);
    tasksByProject.get(t.project_id)!.push(t);
  });

  const blockersByTask = new Map<string, any[]>();
  globalBlockers.forEach((b: any) => {
    if (b.task_id) {
      if (!blockersByTask.has(b.task_id)) blockersByTask.set(b.task_id, []);
      blockersByTask.get(b.task_id)!.push(b);
    }
  });

  const depsByTask = new Map<string, any[]>();
  (input.dependencies || []).forEach(d => {
    if (!depsByTask.has(d.task_id)) depsByTask.set(d.task_id, []);
    depsByTask.get(d.task_id)!.push(d);
  });

  input.projects.forEach(project => {
    const duration = stateDurations[project.id] || {
      currentState: 'active',
      activeDays: 0,
      passiveWaitDays: 0,
      blockedDays: 0,
    };

    const currentState = (duration.currentState || 'active') as 'active' | 'passive_wait' | 'blocked';
    const activeDays = duration.activeDays || 0;
    const passiveWaitDays = duration.passiveWaitDays || 0;
    const blockedDays = duration.blockedDays || 0;

    const totalDays = activeDays + passiveWaitDays + blockedDays;
    const liabilityRatio = totalDays > 0 
      ? Number(((passiveWaitDays + blockedDays) / totalDays * 100).toFixed(1))
      : 0;

    if (project.status !== 'deployed' && project.status !== 'done' && project.status !== 'archived') {
      if (currentState === 'active') activeExecutionProjectsCount++;
      else if (currentState === 'passive_wait') passiveWaitingProjectsCount++;
      else if (currentState === 'blocked') blockedProjectsCount++;
    }

    // Advanced Execution Intelligence modeling
    const projectTasks = tasksByProject.get(project.id) || [];
    const projectBlockers = projectTasks.flatMap(t => blockersByTask.get(t.id) || []);

    // Wait-Time ratio calculation
    const waitCount = projectTasks.filter(t => 
      ['WAITING_FOR_CLIENT', 'WAITING_FOR_DATA', 'WAITING_FOR_INFRASTRUCTURE', 'WAITING_FOR_APPROVAL', 
       'BLOCKED_DEPENDENCY', 'BLOCKED_INFRASTRUCTURE', 'BLOCKED_ACCESS'].includes(taskSubstates[t.id])
    ).length;
    const substateRatio = projectTasks.length > 0 ? (waitCount / projectTasks.length) * 100 : 0;
    const waitTimeRatio = Math.round(Math.max(liabilityRatio, substateRatio));

    // Blocker recurrence score (1-100)
    const blockerRecurrence = Math.min(100, projectBlockers.length * 15 + (projectBlockers.filter((b: any) => b.history && b.history.length > 1).length * 20));

    // Dependency instability score (1-100)
    const projectDepsCount = projectTasks.reduce((acc, t) => acc + (depsByTask.get(t.id)?.length || 0), 0);
    const dependencyInstability = Math.min(100, projectDepsCount * 25);

    // Client responsiveness score (1-100)
    const clientWaitCount = projectTasks.filter(t => ['WAITING_FOR_CLIENT', 'CLIENT_VERIFICATION'].includes(taskSubstates[t.id])).length;
    const clientResponsiveness = Math.min(100, clientWaitCount * 30 + (passiveWaitDays > 3 ? 40 : 0));

    // Coordination overhead score (1-100)
    const coordWaitCount = projectTasks.filter(t => ['INTERNAL_REVIEW', 'WAITING_FOR_APPROVAL', 'RELEASE_WINDOW_PENDING'].includes(taskSubstates[t.id])).length;
    const coordinationOverhead = Math.min(100, coordWaitCount * 25);

    // Infrastructure reliability score (1-100)
    const infraWaitCount = projectTasks.filter(t => ['WAITING_FOR_INFRASTRUCTURE', 'BLOCKED_INFRASTRUCTURE', 'BLOCKED_ACCESS'].includes(taskSubstates[t.id])).length;
    const infrastructureReliability = Math.min(100, infraWaitCount * 35);

    // Operational continuity score (1-100)
    const activeBlockersCount = projectBlockers.filter((b: any) => !b.resolved).length;
    const operationalContinuity = Math.max(10, 100 - (activeBlockersCount * 20 + waitTimeRatio * 0.4));

    // Friction-adjusted delivery confidence
    const doneTasksCount = projectTasks.filter(t => t.status === 'done').length;
    const doneRatio = projectTasks.length > 0 ? (doneTasksCount / projectTasks.length) : 0;
    const baseConfidence = 80 + (doneRatio * 20);
    const frictionPenalty = (waitTimeRatio * 0.3) + (activeBlockersCount * 10) + (dependencyInstability * 0.1);
    const adjustedConfidence = Math.max(5, Math.min(99, Math.round(baseConfidence - frictionPenalty)));

    projectFrictionMetrics[project.id] = {
      projectId: project.id,
      currentState,
      activeDays,
      passiveWaitDays,
      blockedDays,
      liabilityRatio,
      waitTimeRatio,
      adjustedConfidence,
      operationalContinuity,
      frictionCategories: {
        blockerRecurrence,
        dependencyInstability,
        clientResponsiveness,
        coordinationOverhead,
        infrastructureReliability,
      }
    };

    if (project.status !== 'deployed' && project.status !== 'done' && project.status !== 'archived') {
      if (totalDays > 0) {
        totalFrictionImpact += (passiveWaitDays + blockedDays) / totalDays;
      }
      sumWaitTimeRatio += waitTimeRatio;
      sumAdjustedConfidence += adjustedConfidence;
      sumOperationalContinuity += operationalContinuity;

      sumFrictionCategories.blockerRecurrence += blockerRecurrence;
      sumFrictionCategories.dependencyInstability += dependencyInstability;
      sumFrictionCategories.clientResponsiveness += clientResponsiveness;
      sumFrictionCategories.coordinationOverhead += coordinationOverhead;
      sumFrictionCategories.infrastructureReliability += infrastructureReliability;

      activeProjectCount++;
    }
  });

  // Calculate global summary
  let totalShiftDays = 0;
  timelineShiftLedger.forEach(event => {
    totalShiftDays += Number(event.deltaDays) || 0;
  });

  const avgFrictionImpact = activeProjectCount > 0 ? (totalFrictionImpact / activeProjectCount) : 0;
  const globalLiabilityRatio = activeProjectCount > 0 
    ? Number((avgFrictionImpact * 100).toFixed(1))
    : 0;

  const avgWaitTimeRatio = activeProjectCount > 0 ? Math.round(sumWaitTimeRatio / activeProjectCount) : 0;
  const avgAdjustedConfidence = activeProjectCount > 0 ? Math.round(sumAdjustedConfidence / activeProjectCount) : 85;
  const avgOperationalContinuity = activeProjectCount > 0 ? Math.round(sumOperationalContinuity / activeProjectCount) : 95;

  const globalFrictionCategories = {
    blockerRecurrence: activeProjectCount > 0 ? Math.round(sumFrictionCategories.blockerRecurrence / activeProjectCount) : 0,
    dependencyInstability: activeProjectCount > 0 ? Math.round(sumFrictionCategories.dependencyInstability / activeProjectCount) : 0,
    clientResponsiveness: activeProjectCount > 0 ? Math.round(sumFrictionCategories.clientResponsiveness / activeProjectCount) : 0,
    coordinationOverhead: activeProjectCount > 0 ? Math.round(sumFrictionCategories.coordinationOverhead / activeProjectCount) : 0,
    infrastructureReliability: activeProjectCount > 0 ? Math.round(sumFrictionCategories.infrastructureReliability / activeProjectCount) : 0,
  };

  const globalFrictionSummary = {
    globalLiabilityRatio,
    totalShiftCount: timelineShiftLedger.length,
    totalShiftDays,
    activeExecutionProjects: activeExecutionProjectsCount,
    passiveWaitingProjects: passiveWaitingProjectsCount,
    blockedProjects: blockedProjectsCount,
    avgWaitTimeRatio,
    avgAdjustedConfidence,
    avgOperationalContinuity,
    globalFrictionCategories,
  };

  // Friction-Adjusted Forecasting: Incorporate wait-state duration latency into delivery confidence
  const deliveryConfidence = avgAdjustedConfidence;

  const stats: Stats = {
    totalProjects: activeWorkflows.length,
    deliveryConfidence,
    teamBandwidth,
    dailyFatigue: input.serverMetrics?.dailyFatigue ?? 0,
  };

  const systemData = buildLogisticsSystemData({
    teams: input.teams,
    attendanceRows: input.attendanceRows,
    
    workspaceSettingsBlob: input.workspaceSettingsBlob,
  });

  return {
    projectsWithPert,
    visibleProjects,
    visibleTasks,
    stats,
    deliveryConfidence: stats.deliveryConfidence,
    teamBandwidth: stats.teamBandwidth,
    dailyFatigue: stats.dailyFatigue,
    executionPressure: input.serverMetrics?.executionPressure ?? 0,
    riskForecast: input.serverMetrics?.riskForecast ?? 0,
    systemData,
    userCustomRoles: (systemData.userCustomRoles as Record<string, string>) || {},
    customRoles: (systemData.customRoles as string[]) || ['Developer', 'Designer', 'QA Engineer', 'Viewer'],
    activeTeams,
    projectFrictionMetrics,
    globalFrictionSummary,
    timelineShiftLedger,
  };
}
