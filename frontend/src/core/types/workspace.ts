export type UserRole =
  | 'super_admin'
  | 'pm'
  | 'developer'
  | 'viewer'
  | 'uninvited'
  | 'pending-workspace-setup';

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  business_type: string;
  work_start: string;
  work_end: string;
  lunch_duration: number;
  workdays: number[];
  timezone: string;
  attendance_enabled: boolean;
  payroll_enabled: boolean;
  productivity_factor: number;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  auth_user_id?: string;
  workspace_id: string;
  email: string;
  full_name?: string;
  phone?: string;
  avatar_url?: string;
  role: UserRole;
  designation?: string;
  date_of_joining?: string;
  employment_status?: 'active' | 'resigned' | 'terminated';
  availability_factor: number;
  created_at: string;
}

/** @deprecated Use Member — kept for existing imports. */
export type User = Member;

/** @deprecated Use Member — kept for existing imports. */
export type Profile = Member;
