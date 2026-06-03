import type { ExecutionState } from './execution';

export type NotificationCategory = 'assignments' | 'deadlines' | 'risk' | 'attendance' | 'system';
export type MeetingType =
  | 'sync'
  | 'planning'
  | 'review'
  | 'retrospective'
  | 'standup'
  | 'design'
  | 'qa'
  | 'release'
  | 'post-mortem'
  | 'custom';
export type MilestoneState = 'pending' | 'achieved' | 'missed';

/** @deprecated Use MilestoneState */
export type MilestoneStatus = MilestoneState;

export type ApprovalState = 'pending' | 'approved' | 'rejected';

/** @deprecated Use ApprovalState */
export type ApprovalStatus = ApprovalState;

export interface Team {
  id: string;
  workspace_id: string;
  name: string;
  capacity_hours_per_week?: number;
  data?: unknown;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  workspace_id: string;
  team_id: string;
  user_id: string;
  member_role?: string;
}

export interface Comment {
  id: string;
  workspace_id: string;
  task_id?: string;
  project_id?: string;
  author_id?: string;
  body: string;
  created_at: string;
}

export interface FileAsset {
  id: string;
  workspace_id: string;
  project_id?: string;
  task_id?: string;
  uploaded_by?: string;
  bucket: string;
  path: string;
  name: string;
  mime_type?: string;
  size_bytes?: number;
  created_at: string;
}

export interface Notification {
  id: string;
  workspace_id: string;
  user_id?: string;
  category: NotificationCategory;
  title: string;
  body?: string;
  read_at?: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  workspace_id: string;
  actor_id?: string;
  project_id?: string;
  task_id?: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type AttendanceStatus = 'present' | 'half_day' | 'absent';
export type LeaveType = 'casual' | 'medical' | 'unexcused';

export interface Attendance {
  id: string;
  workspace_id: string;
  user_id: string;
  date: string;
  status: AttendanceStatus;
  leave_type?: LeaveType;
  availability_factor: number;
  created_at: string;
}

export interface Meeting {
  id: string;
  workspace_id: string;
  project_id?: string;
  title: string;
  description?: string;
  meeting_type: MeetingType;
  start_time: string;
  end_time: string;
  organizer_id?: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingAttendee {
  meeting_id: string;
  user_id: string;
  attended: boolean;
}

export type MilestoneType = 'execution' | 'approval' | 'client' | 'infrastructure' | 'compliance' | 'delivery';

export interface Milestone {
  id: string;
  workspace_id: string;
  project_id: string;
  sprint_id?: string;
  title: string;
  description?: string;
  target_date: string;
  status: MilestoneState;
  owner_id?: string;
  milestone_type?: MilestoneType;
  created_at: string;
  updated_at: string;
}

export type WaitStateCategory = 'client' | 'vendor' | 'approval' | 'compliance' | 'infrastructure' | 'data' | 'internal_cross_team';
export type WaitStateOwner = 'client' | 'vendor' | 'internal_team' | 'pm' | 'compliance' | 'infrastructure' | 'external_partner' | 'other';
export type WaitStateTargetType = 'project' | 'milestone' | 'task';

export interface WaitState {
  id: string;
  workspace_id: string;
  target_type: WaitStateTargetType;
  target_id: string;
  category: WaitStateCategory;
  reason?: string;
  waiting_on: WaitStateOwner;
  status: 'active' | 'resolved';
  started_at: string;
  resolved_at?: string;
  duration_hours: number;
}

export interface Approval {
  id: string;
  workspace_id: string;
  project_id: string;
  milestone_id?: string;
  task_id?: string;
  story_id?: string;
  phase: string;
  approver_id?: string;
  status: ApprovalState;
  comment?: string;
  reviewed_at?: string;
  created_at: string;
}

export type CalendarEventType =
  | 'holiday'
  | 'leave'
  | 'meeting'
  | 'festival'
  | 'regional'
  | 'company'
  | 'sprint'
  | 'deployment'
  | 'client_review'
  | 'approval';

export interface CalendarEvent {
  id: string;
  workspace_id: string;
  event_type: CalendarEventType;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  participants?: string[];
  capacity_impact: number;
  is_recurring?: boolean;
  recurrence_rule?: string;
  timezone?: string;
  auto_generated?: boolean;
  capacity_modifier?: number;
  source_id?: string;
  source_table?: string;
  visibility?: 'private' | 'global' | 'team';
  team_id?: string;
  owner_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Stats {
  totalProjects: number;
  deliveryConfidence: number;
  teamBandwidth: number;
  dailyFatigue: number;
}

export type SkillLevel = 'intern' | 'junior' | 'mid' | 'senior' | 'lead';

export interface ResourceProfile {
  skill_level: SkillLevel;
  experience_years: number;
  focus_factor: number;
  parallel_efficiency: number;
  context_switch_penalty: number;
  meeting_burden: number;
}

/** Map persistence status string to domain ExecutionState (identity when valid). */
export function toExecutionState(status: string | null | undefined): ExecutionState {
  const allowed: ExecutionState[] = ['backlog', 'ready', 'in_progress', 'review', 'done'];
  if (status && allowed.includes(status as ExecutionState)) {
    return status as ExecutionState;
  }
  return 'backlog';
}
