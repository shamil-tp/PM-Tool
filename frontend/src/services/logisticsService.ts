import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { AttendanceRow, SalaryRow } from '../core/operational/types';
import type { Team } from '../types';

export interface SaveLogisticsInput {
  workspaceId: string;
  updatedData: Record<string, unknown>;
  previousSystemData: Record<string, unknown>;
}

export interface SaveLogisticsResult {
  settingsPatch: Record<string, unknown>;
  attendanceRows?: AttendanceRow[];
  salaryRows?: SalaryRow[];
  teamsPatch?: (prev: Team[]) => Team[];
  persisted: boolean;
}

function attendanceFactor(status: string): number {
  if (status === 'present') return 1.0;
  if (status === 'half_day') return 0.5;
  return 0.0;
}

async function persistAttendanceChanges(
  workspaceId: string,
  previous: Record<string, Record<string, { status: string; leaveType?: string; isPaidHalfDay?: boolean }>>,
  next: Record<string, Record<string, { status: string; leaveType?: string; isPaidHalfDay?: boolean }>>,
): Promise<boolean> {
  const promises: Promise<unknown>[] = [];

  Object.keys(next).forEach(dateStr => {
    const dayRecords = next[dateStr];
    Object.keys(dayRecords).forEach(userId => {
      const record = dayRecords[userId];
      const oldRecord = previous[dateStr]?.[userId];
      if (
        !oldRecord ||
        oldRecord.status !== record.status ||
        oldRecord.leaveType !== record.leaveType ||
        oldRecord.isPaidHalfDay !== record.isPaidHalfDay
      ) {
        promises.push(
          (async () => {
            const { data: existing } = await supabase
              .from('attendance')
              .select('id')
              .eq('workspace_id', workspaceId)
              .eq('user_id', userId)
              .eq('date', dateStr)
              .maybeSingle();

            if (existing) {
              return supabase
                .from('attendance')
                .update({
                  status: record.status,
                  leave_type: record.leaveType || null,
                  availability_factor: attendanceFactor(record.status),
                })
                .eq('id', existing.id);
            }

            return supabase.from('attendance').insert({
              workspace_id: workspaceId,
              user_id: userId,
              date: dateStr,
              status: record.status,
              leave_type: record.leaveType || null,
              availability_factor: attendanceFactor(record.status),
            });
          })(),
        );
      }
    });
  });

  if (promises.length === 0) return false;
  await Promise.all(promises);
  return true;
}



function flattenAttendance(
  workspaceId: string,
  attendance: Record<string, Record<string, { status: string; leaveType?: string; isPaidHalfDay?: boolean }>>,
): AttendanceRow[] {
  const records: AttendanceRow[] = [];
  Object.keys(attendance).forEach(dateStr => {
    Object.keys(attendance[dateStr]).forEach(userId => {
      const record = attendance[dateStr][userId];
      records.push({
        workspace_id: workspaceId,
        user_id: userId,
        date: dateStr,
        status: record.status,
        leave_type: record.leaveType || null,
        is_paid_half_day: !!record.isPaidHalfDay,
        availability_factor: attendanceFactor(record.status),
      });
    });
  });
  return records;
}

export async function saveLogisticsData(input: SaveLogisticsInput): Promise<SaveLogisticsResult> {
  const payload = { ...input.updatedData };
  let attendanceRows: AttendanceRow[] | undefined;
  let persisted = false;

  if (payload.attendance && isSupabaseConfigured) {
    const next = payload.attendance as Record<
      string,
      Record<string, { status: string; leaveType?: string; isPaidHalfDay?: boolean }>
    >;
    const previous = (input.previousSystemData.attendance || {}) as typeof next;

    try {
      persisted = await persistAttendanceChanges(input.workspaceId, previous, next) || persisted;
    } catch (err) {
      console.error('[logisticsService] attendance persist failed:', err);
    }

    attendanceRows = flattenAttendance(input.workspaceId, next);
    delete payload.attendance;
  }

  localStorage.setItem('SYSTEM_SETTINGS', JSON.stringify(payload));

  if (isSupabaseConfigured) {
    const { data: existingWorkspaceSettings, error: findWorkspaceError } = await supabase
      .from('workspace_settings')
      .select('*')
      .eq('workspace_id', input.workspaceId)
      .maybeSingle();

    if (!findWorkspaceError && existingWorkspaceSettings) {
      const mergedWorkspaceData = {
        ...(existingWorkspaceSettings.settings_blob as Record<string, unknown>),
        ...payload,
      };
      const { error } = await supabase
        .from('workspace_settings')
        .update({ settings_blob: mergedWorkspaceData })
        .eq('workspace_id', input.workspaceId);
      persisted = !error || persisted;
    } else {
      const { error } = await supabase
        .from('workspace_settings')
        .insert({ workspace_id: input.workspaceId, settings_blob: payload });
      persisted = !error || persisted;
    }
  }

  const teamsPatch = (prev: Team[]): Team[] => {
    const settingsTeam = prev.find(t => t.name === 'SYSTEM_SETTINGS');
    if (settingsTeam) {
      return prev.map(t =>
        t.name === 'SYSTEM_SETTINGS' ? { ...t, data: { ...(t.data as Record<string, unknown>), ...payload } } : t,
      );
    }
    return [
      ...prev,
      {
        id: 'SYSTEM_SETTINGS',
        workspace_id: input.workspaceId,
        name: 'SYSTEM_SETTINGS',
        data: payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Team,
    ];
  };

  return {
    settingsPatch: payload,
    attendanceRows,
    teamsPatch,
    persisted,
  };
}
