import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Project, Profile, Team } from '../types';
import { normalizeProjectsFromRows } from '../core/types/normalize';
import type { AttendanceRow, SalaryRow } from '../core/operational/types';

/** Canonical fetch — workspace scope is implied by workspaceId. */
export async function fetchProjects(workspaceId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[operationalDataService] fetchProjects:', error);
    return [];
  }
  return normalizeProjectsFromRows((data || []) as Record<string, unknown>[]);
}

/** @deprecated Use fetchProjects */
export const fetchWorkspaceProjects = fetchProjects;

export async function fetchWorkspaceProfiles(workspaceId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  let users = (!error && data) ? (data as Profile[]) : [];
  
  if (users.length === 0) {
    const { data: fallback, error: fallbackErr } = await supabase.from('profiles').select('*');
    if (!fallbackErr && fallback) {
      users = fallback as Profile[];
    }
  }

  if (users.length > 0) {
    const { data: empData, error: empError } = await supabase
      .from('employment_records')
      .select('profile_id, date_of_joining, employment_status')
      .eq('workspace_id', workspaceId);

    if (!empError && empData) {
      const empMap = new Map();
      empData.forEach((record: any) => empMap.set(record.profile_id, record));
      users = users.map(u => {
        const emp = empMap.get(u.id);
        if (emp) {
          return {
            ...u,
            date_of_joining: emp.date_of_joining,
            employment_status: emp.employment_status,
          };
        }
        return u;
      });
    }
  }

  return users;
}

export async function fetchWorkspaceAttendance(workspaceId: string): Promise<AttendanceRow[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('workspace_id', workspaceId);
    if (!error && data) return data as AttendanceRow[];
  } catch (err) {
    console.warn('[operationalDataService] fetchWorkspaceAttendance:', err);
  }
  return [];
}

export async function fetchWorkspaceSalaries(workspaceId: string): Promise<SalaryRow[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('salaries')
      .select('*')
      .eq('workspace_id', workspaceId);
    if (!error && data) return data as SalaryRow[];
  } catch (err) {
    console.warn('[operationalDataService] fetchWorkspaceSalaries:', err);
  }
  return [];
}

export async function fetchWorkspaceTeams(workspaceId: string): Promise<Team[]> {
  const { data: teamsData, error: teamsError } = await supabase
    .from('teams')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (teamsError || !teamsData) {
    const localSettings = localStorage.getItem('SYSTEM_SETTINGS');
    if (localSettings) {
      const parsedSettings = JSON.parse(localSettings);
      return [{
        id: 'SYSTEM_SETTINGS',
        workspace_id: workspaceId,
        name: 'SYSTEM_SETTINGS',
        data: parsedSettings,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Team];
    }
    return [];
  }

  const { data: membersData, error: membersError } = await supabase
    .from('team_members')
    .select('*')
    .eq('workspace_id', workspaceId);

  const membersList = !membersError && membersData ? membersData : [];

  return Promise.all(
    teamsData.map(async team => {
      if (team.name === 'SYSTEM_SETTINGS') {
        if (team.data) {
          localStorage.setItem('SYSTEM_SETTINGS', JSON.stringify(team.data));
        }
        return team as Team;
      }

      const teamMembers = membersList.filter((m: { team_id: string }) => m.team_id === team.id);
      let pmId = teamMembers.find((m: { member_role: string }) => m.member_role === 'pm')?.user_id;
      let devIds = teamMembers
        .filter((m: { member_role: string }) => m.member_role === 'developer')
        .map((m: { user_id: string }) => m.user_id);

      const parsedLegacyData =
        typeof team.data === 'string' ? JSON.parse(team.data) : team.data;

      if (
        teamMembers.length === 0 &&
        parsedLegacyData &&
        (parsedLegacyData.pm_id || parsedLegacyData.developer_ids)
      ) {
        const inserts: Record<string, unknown>[] = [];
        if (parsedLegacyData.pm_id) {
          inserts.push({
            workspace_id: workspaceId,
            team_id: team.id,
            user_id: parsedLegacyData.pm_id,
            member_role: 'pm',
          });
          pmId = parsedLegacyData.pm_id;
        }
        if (parsedLegacyData.developer_ids && Array.isArray(parsedLegacyData.developer_ids)) {
          parsedLegacyData.developer_ids.forEach((dId: string) => {
            inserts.push({
              workspace_id: workspaceId,
              team_id: team.id,
              user_id: dId,
              member_role: 'developer',
            });
          });
          devIds = parsedLegacyData.developer_ids;
        }
        if (inserts.length > 0) {
          await supabase.from('team_members').insert(inserts);
        }
      }

      return {
        ...team,
        data: { pm_id: pmId || '', developer_ids: devIds || [] },
      } as Team;
    }),
  );
}

export async function fetchWorkspaceSettingsBlob(workspaceId: string): Promise<Record<string, unknown>> {
  if (!isSupabaseConfigured) return {};
  const { data } = await supabase
    .from('workspace_settings')
    .select('settings_blob')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return (data?.settings_blob as Record<string, unknown>) || {};
}

export async function fetchSkills(workspaceId: string) {
  const { data } = await supabase.from('skills').select('*').eq('workspace_id', workspaceId);
  return data || [];
}

export async function fetchUserSkills(workspaceId: string) {
  const { data: users } = await supabase.from('users').select('id').eq('workspace_id', workspaceId);
  if (!users) return [];
  const userIds = users.map(u => u.id);
  
  if (userIds.length === 0) return [];
  
  const { data: userSkills } = await supabase.from('user_skills').select('*').in('user_id', userIds);
  return userSkills || [];
}
export async function createSkill(workspaceId: string, name: string, category: string = 'General') {
  const { data, error } = await supabase.from('skills').insert({
    workspace_id: workspaceId,
    name,
    category
  }).select().single();
  
  if (error) throw error;
  return data;
}

export async function deleteSkill(skillId: string) {
  const { error } = await supabase.from('skills').delete().eq('id', skillId);
  if (error) throw error;
  return true;
}

export async function upsertUserSkill(userId: string, skillId: string, level: string, verifierId?: string) {
  const { data: existing, error: findError } = await supabase.from('user_skills')
    .select('id').eq('user_id', userId).eq('skill_id', skillId).maybeSingle();
    
  if (existing) {
    const { error } = await supabase.from('user_skills')
      .update({ level, verified_by: verifierId, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
    return true;
  } else {
    const { error } = await supabase.from('user_skills').insert({
      user_id: userId,
      skill_id: skillId,
      level,
      verified_by: verifierId
    });
    if (error) throw error;
    return true;
  }
}

export async function removeUserSkill(userId: string, skillId: string) {
  const { error } = await supabase.from('user_skills').delete().eq('user_id', userId).eq('skill_id', skillId);
  if (error) throw error;
  return true;
}
