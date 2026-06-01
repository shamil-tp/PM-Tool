import type { Project, Profile, Task, TaskDependency, Team, Stats } from '../../types';

/** Canonical raw operational entities — persisted / fetched state only. */
export interface OperationalRawState {
  projects: Project[];
  tasks: Task[];
  dependencies: TaskDependency[];
  teams: Team[];
  profiles: Profile[];
  attendanceRows: AttendanceRow[];
  
  workspaceSettingsBlob: Record<string, unknown>;
  allocationPeriods?: any[]; // Phase 2A.1

  skills?: Skill[];
  userSkills?: UserSkill[];
}

export interface AttendanceRow {
  id?: string;
  workspace_id: string;
  user_id: string;
  date: string;
  status: string;
  leave_type?: string | null;
  is_paid_half_day?: boolean;
  availability_factor?: number;
}

export interface SalaryRow {
  id?: string;
  workspace_id?: string;
  user_id: string;
  base_salary: number;
}

export interface Skill {
  id: string;
  workspace_id: string;
  name: string;
  category: string;
}

export interface UserSkill {
  id: string;
  user_id: string;
  skill_id: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  verified_by?: string;
}

export interface ProjectFrictionMetric {
  projectId: string;
  currentState: 'active' | 'passive_wait' | 'blocked';
  activeDays: number;
  passiveWaitDays: number;
  blockedDays: number;
  liabilityRatio: number;
  waitTimeRatio: number; // Percentage of total active duration spent waiting (e.g. 72)
  adjustedConfidence: number; // Friction-adjusted delivery confidence (e.g. 85)
  operationalContinuity: number; // Stability score based on context switches (1-100)
  frictionCategories: {
    blockerRecurrence: number;
    dependencyInstability: number;
    clientResponsiveness: number;
    coordinationOverhead: number;
    infrastructureReliability: number;
  };
}

export interface GlobalFrictionSummary {
  globalLiabilityRatio: number;
  totalShiftCount: number;
  totalShiftDays: number;
  activeExecutionProjects: number;
  passiveWaitingProjects: number;
  blockedProjects: number;
  avgWaitTimeRatio: number;
  avgAdjustedConfidence: number;
  avgOperationalContinuity: number;
  globalFrictionCategories: {
    blockerRecurrence: number;
    dependencyInstability: number;
    clientResponsiveness: number;
    coordinationOverhead: number;
    infrastructureReliability: number;
  };
}

export interface TimelineShiftEvent {
  id: string;
  projectId: string;
  projectName: string;
  deltaDays: number;
  blockerCategory: string;
  ownership: string;
  timestamp: string;
  reason: string;
}

/** Derived intelligence — recomputable from raw state; never persisted as source of truth. */
export interface OperationalDerivedState {
  projectsWithPert: Project[];
  visibleProjects: Project[];
  visibleTasks: Task[];
  stats: Stats;
  deliveryConfidence: number;
  teamBandwidth: number;
  dailyFatigue: number;
  executionPressure: number;
  riskForecast: number;
  systemData: Record<string, unknown>;
  userCustomRoles: Record<string, string>;
  customRoles: string[];
  activeTeams: Team[];
  projectFrictionMetrics: Record<string, ProjectFrictionMetric>;
  globalFrictionSummary: GlobalFrictionSummary;
  timelineShiftLedger: TimelineShiftEvent[];
}

