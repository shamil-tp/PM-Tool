import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { DataGovernanceEngine } from '../core/governance/dataGovernanceEngine';
import { useAuth } from './AuthContext';
import { useWorkspace } from './WorkspaceContext';
import { useTasks } from '../hooks/useTasks';
import { hasCapability } from '../core/auth/permissions';
import { computeOperationalDerived } from '../core/operational/derivedMetrics';
import type { OperationalDerivedState, OperationalRawState } from '../core/operational/types';
import { compileCoherentPlatformState, GovernanceCache } from '../core/execution/governanceEngine';
import { refreshOperationalSnapshot, refreshOperationalPartial } from '../services/operationalSyncService';
import { saveLogisticsData } from '../services/logisticsService';
import {
  loadWorkspaceNotifications,
  subscribeToWorkspaceNotifications,
} from '../services/realtimeNotificationService';
import { markAsRead } from '../services/notificationService';
import type { Project, Profile, Team, UserRole, Notification } from '../types';

interface OperationalDataContextValue {
  raw: OperationalRawState;
  derived: OperationalDerivedState;
  governanceCache: GovernanceCache;
  loading: boolean;
  dbNotifications: Notification[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  refreshAll: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  refreshAttendance: () => Promise<void>;
  
  handleSaveLogisticsData: (data: Record<string, unknown>) => Promise<'success' | 'unauthorized' | 'error'>;
  handleCreateTeam: (name: string, pmId: string, devIds: string[]) => Promise<void>;
  handleUpdateTeam: (id: string, name: string, pmId: string, devIds: string[]) => Promise<void>;
  handleDeleteTeam: (id: string) => Promise<void>;
  handleUpdateRole: (id: string, role: UserRole) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  fetchNotifications: () => Promise<void>;
  updateWorkspaceSettings: (patch: Record<string, unknown>) => Promise<void>;
  taskActions: {
    addDependency: ReturnType<typeof useTasks>['addDependency'];
    removeDependency: ReturnType<typeof useTasks>['removeDependency'];
    updateTaskDates: ReturnType<typeof useTasks>['updateTaskDates'];
    updateTask: ReturnType<typeof useTasks>['updateTask'];
    addTask: ReturnType<typeof useTasks>['addTask'];
    updateTaskStatus: ReturnType<typeof useTasks>['updateTaskStatus'];
    deleteTask: ReturnType<typeof useTasks>['deleteTask'];
  };
}

export const OperationalDataContext = createContext<OperationalDataContextValue | null>(null);

export function OperationalDataProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, updateRole } = useAuth();
  const { workspace } = useWorkspace();
  const {
    tasks,
    dependencies,
    addDependency,
    removeDependency,
    updateTaskDates,
    updateTask,
    addTask,
    updateTaskStatus,
    deleteTask,
  } = useTasks(workspace?.id);

  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<OperationalRawState['attendanceRows']>([]);
  
  const [workspaceSettingsBlob, setWorkspaceSettingsBlob] = useState<Record<string, unknown>>({});
  const [serverMetrics, setServerMetrics] = useState<{ deliveryConfidence: number; executionPressure: number; dailyFatigue: number; riskForecast: number; } | undefined>();
  const [loading, setLoading] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [dbNotifications, setDbNotifications] = useState<Notification[]>([]);
  const [allocationPeriods, setAllocationPeriods] = useState<any[]>([]);
  const [skills, setSkills] = useState<OperationalRawState['skills']>([]);
  const [userSkills, setUserSkills] = useState<OperationalRawState['userSkills']>([]);

  const raw: OperationalRawState = useMemo(
    () => ({
      projects,
      tasks,
      dependencies,
      teams,
      profiles,
      attendanceRows,
      
      workspaceSettingsBlob,
      allocationPeriods,
      skills,
      userSkills
    }),
    [projects, tasks, dependencies, teams, profiles, attendanceRows, workspaceSettingsBlob, allocationPeriods, skills, userSkills]
  );

  const derived = useMemo(
    () =>
      computeOperationalDerived({
        projects,
        tasks,
        teams,
        profiles,
        attendanceRows,
        
        workspaceSettingsBlob,
        userId: profile?.id || '',
        userRole: profile?.role || 'viewer',
        dependencies,
        serverMetrics,
      }),
    [projects, tasks, dependencies, teams, profiles, attendanceRows,  workspaceSettingsBlob, profile?.id, profile?.role, serverMetrics],
  );

  const decisions = useMemo(() => {
    return (workspaceSettingsBlob?.operational_decisions || []) as any[];
  }, [workspaceSettingsBlob]);

  const events = useMemo(() => {
    return (workspaceSettingsBlob?.coordination_events || []) as any[];
  }, [workspaceSettingsBlob]);

  const blockers = useMemo(() => {
    const rawBlockers = (workspaceSettingsBlob?.execution_blockers || []) as any[];
    const validTaskIds = new Set(tasks.map(t => t.id));
    return rawBlockers.filter(b => validTaskIds.has(b.task_id));
  }, [workspaceSettingsBlob, tasks]);

  const [governanceCache, setGovernanceCache] = useState<GovernanceCache>(() => 
    compileCoherentPlatformState(projects, tasks, teams, profiles, blockers, dependencies, decisions, events)
  );

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) {
        setGovernanceCache(compileCoherentPlatformState(projects, tasks, teams, profiles, blockers, dependencies, decisions, events));
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [projects, tasks, teams, profiles, blockers, dependencies, decisions, events]);

  const refreshAll = useCallback(async () => {
    if (!workspace?.id) return;
    const snapshot = await refreshOperationalSnapshot(workspace.id);

    // FIX 1 & 2: JSONB Monolith Decomposition & Operational History Partitioning
    // Background governance check to partition out inactive blockers from hot storage
    if (snapshot.workspaceSettingsBlob?.execution_blockers) {
      const blockers = snapshot.workspaceSettingsBlob.execution_blockers as any[];
      DataGovernanceEngine.partitionBlockerHistory(workspace.id, blockers).then(result => {
        if (result.archivedCount > 0) {
          console.log(`[DataGovernance] Archived ${result.archivedCount} blockers. Decomposing monolith.`);
          updateWorkspaceSettings({ execution_blockers: result.active });
        }
      }).catch(console.error);
    }
    
    // Background execution of audit compression & observability aggregation
    DataGovernanceEngine.compressAuditHistory(workspace.id).catch(console.error);
    DataGovernanceEngine.aggregateObservabilitySignals(workspace.id).catch(console.error);
    
    // FIX 6 & 7: Intelligence History Scalability & Dependency History Reconstruction
    if (snapshot.serverMetrics) {
      DataGovernanceEngine.snapshotOrganizationalIntelligence(workspace.id, snapshot.serverMetrics).catch(console.error);
    }
    
    // FIX 8: Archival Consistency Governance
    // Periodically verify the integrity of our archival flow
    DataGovernanceEngine.verifyArchivalConsistency(workspace.id, 'blocker_archive').then(isValid => {
      if (!isValid) console.warn('Archival consistency warning: Blocker archive integrity compromised');
    }).catch(console.error);

    setProjects(snapshot.projects);
    setProfiles(snapshot.profiles);
    setTeams(snapshot.teams);
    setAttendanceRows(snapshot.attendanceRows);
    setWorkspaceSettingsBlob(snapshot.workspaceSettingsBlob);
    setServerMetrics(snapshot.serverMetrics);
    if (snapshot.allocationPeriods) setAllocationPeriods(snapshot.allocationPeriods);
    if (snapshot.skills) setSkills(snapshot.skills);
    if (snapshot.userSkills) setUserSkills(snapshot.userSkills);
  }, [workspace?.id]);

  const refreshProjects = useCallback(async () => {
    if (!workspace?.id) return;
    const partial = await refreshOperationalPartial(workspace.id, ['projects', 'serverMetrics']);
    if (partial.projects) setProjects(partial.projects);
    if (partial.serverMetrics) setServerMetrics(partial.serverMetrics);
  }, [workspace?.id]);

  const refreshAttendance = useCallback(async () => {
    if (!workspace?.id) return;
    const partial = await refreshOperationalPartial(workspace.id, ['attendanceRows']);
    if (partial.attendanceRows) setAttendanceRows(partial.attendanceRows);
  }, [workspace?.id]);

  const fetchNotifications = useCallback(async () => {
    if (!workspace?.id) return;
    const data = await loadWorkspaceNotifications(workspace.id, user?.id);
    setDbNotifications(data);
  }, [workspace?.id, user?.id]);

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!workspace?.id) return;
      const success = await markAsRead(notificationId, workspace.id);
      if (success) {
        setDbNotifications(prev =>
          prev.map(n =>
            n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n,
          ),
        );
      }
    },
    [workspace?.id],
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (user && profile && workspace?.id) {
        await refreshAll();
      } else if (!user) {
        setProjects([]);
        setTeams([]);
        setProfiles([]);
        setAttendanceRows([]);
      }
      if (mounted) setLoading(false);
    };

    load();

    // Reconnect Storm Hardening
    const handleOnline = () => {
      setIsReconnecting(true);
      // Staged recovery with random jitter to prevent thundering herd
      const delay = Math.random() * 2000 + 1000;
      setTimeout(() => {
        if (mounted && user && profile && workspace?.id) {
          refreshAll().finally(() => {
            setIsReconnecting(false);
          });
        }
      }, delay);
    };
    window.addEventListener('online', handleOnline);

    return () => {
      mounted = false;
      window.removeEventListener('online', handleOnline);
    };
  }, [user, profile, workspace?.id, refreshAll]);

  // Multi-Tab State Consistency
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === `workspace_settings_${workspace?.id}` && e.newValue) {
        try {
          const next = JSON.parse(e.newValue);
          setWorkspaceSettingsBlob(next);
        } catch (err) {
          console.warn('Failed to sync settings across tabs', err);
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [workspace?.id]);

  useEffect(() => {
    fetchNotifications();
    if (!workspace?.id) return;

    return subscribeToWorkspaceNotifications(workspace.id, user?.id, row => {
      setDbNotifications(prev => [row, ...prev]);
      window.dispatchEvent(
        new CustomEvent('notify-toast', {
          detail: {
            message: `${String(row.title || '').toUpperCase()}: ${row.body || ''}`,
            type: 'warning',
          },
        }),
      );
    });
  }, [workspace?.id, user?.id, fetchNotifications]);

  const handleSaveLogisticsData = useCallback(
    async (updatedData: Record<string, unknown>) => {
      if (!hasCapability(profile?.role, 'manage_logistics') || !workspace?.id) {
        return 'unauthorized';
      }

      const result = await saveLogisticsData({
        workspaceId: workspace.id,
        updatedData,
        previousSystemData: derived.systemData,
      });

      setWorkspaceSettingsBlob(prev => ({ ...prev, ...result.settingsPatch }));
      if (result.attendanceRows) setAttendanceRows(result.attendanceRows);
      if (result.teamsPatch) setTeams(result.teamsPatch);

      if (result.persisted) {
        window.dispatchEvent(
          new CustomEvent('notify-toast', {
            detail: { message: 'Logistics analytics synchronized.', type: 'success' },
          }),
        );
      }

      return result.persisted ? 'success' : 'error';
    },
    [profile?.role, workspace?.id, derived.systemData],
  );

  const handleCreateTeam = useCallback(
    async (name: string, pmId: string, devIds: string[]) => {
      if (!hasCapability(profile?.role, 'manage_teams') || !workspace?.id) return;

      const { data, error } = await supabase
        .from('teams')
        .insert({ workspace_id: workspace.id, name, capacity_hours_per_week: 40 * devIds.length })
        .select()
        .single();

      if (!error && data) {
        const memberInserts: Record<string, unknown>[] = [];
        if (pmId) {
          memberInserts.push({
            workspace_id: workspace.id,
            team_id: data.id,
            user_id: pmId,
            member_role: 'pm',
          });
        }
        devIds.forEach(devId => {
          memberInserts.push({
            workspace_id: workspace.id,
            team_id: data.id,
            user_id: devId,
            member_role: 'developer',
          });
        });
        if (memberInserts.length > 0) {
          await supabase.from('team_members').insert(memberInserts);
        }
        setTeams(prev => [
          ...prev,
          { ...data, data: { pm_id: pmId, developer_ids: devIds } } as Team,
        ]);
      }
    },
    [profile?.role, workspace?.id],
  );

  const handleUpdateTeam = useCallback(
    async (id: string, name: string, pmId: string, devIds: string[]) => {
      if (!hasCapability(profile?.role, 'manage_teams') || !workspace?.id) return;

      await supabase.from('teams').update({ name }).eq('id', id);
      await supabase.from('team_members').delete().eq('team_id', id);

      const memberInserts: Record<string, unknown>[] = [];
      if (pmId) {
        memberInserts.push({
          workspace_id: workspace.id,
          team_id: id,
          user_id: pmId,
          member_role: 'pm',
        });
      }
      devIds.forEach(devId => {
        memberInserts.push({
          workspace_id: workspace.id,
          team_id: id,
          user_id: devId,
          member_role: 'developer',
        });
      });
      if (memberInserts.length > 0) {
        await supabase.from('team_members').insert(memberInserts);
      }

      setTeams(prev =>
        prev.map(t =>
          t.id === id ? { ...t, name, data: { pm_id: pmId, developer_ids: devIds } } : t,
        ),
      );
    },
    [profile?.role, workspace?.id],
  );

  const handleDeleteTeam = useCallback(
    async (id: string) => {
      if (!hasCapability(profile?.role, 'manage_teams')) return;
      await supabase.from('team_members').delete().eq('team_id', id);
      await supabase.from('teams').delete().eq('id', id);
      setTeams(prev => prev.filter(t => t.id !== id));
    },
    [profile?.role],
  );

  const patchQueueRef = useRef<Record<string, unknown>[]>([]);
  const isSyncingSettingsRef = useRef(false);

  const processSettingsQueue = useCallback(async () => {
    if (isSyncingSettingsRef.current || patchQueueRef.current.length === 0 || !workspace?.id || !isSupabaseConfigured) return;
    
    isSyncingSettingsRef.current = true;
    try {
      while (patchQueueRef.current.length > 0) {
        const batch = patchQueueRef.current.splice(0, patchQueueRef.current.length);
        const combinedPatch = Object.assign({}, ...batch);

        const { data: existing, error: findError } = await supabase
          .from('workspace_settings')
          .select('*')
          .eq('workspace_id', workspace.id)
          .maybeSingle();

        if (!findError && existing) {
          const merged = {
            ...(existing.settings_blob as Record<string, unknown>),
            ...combinedPatch,
          };
          await supabase
            .from('workspace_settings')
            .update({ settings_blob: merged })
            .eq('workspace_id', workspace.id);
        } else if (!existing) {
          await supabase
            .from('workspace_settings')
            .insert({ workspace_id: workspace.id, settings_blob: combinedPatch });
        }
      }
    } catch (e) {
      console.error('Failed to sync workspace settings:', e);
    } finally {
      isSyncingSettingsRef.current = false;
    }
  }, [workspace?.id]);

  const updateWorkspaceSettings = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!workspace?.id) return;

      setWorkspaceSettingsBlob(prev => {
        const next = { ...prev, ...patch };
        localStorage.setItem(`workspace_settings_${workspace.id}`, JSON.stringify(next));
        return next;
      });
      
      patchQueueRef.current.push(patch);
      processSettingsQueue().catch(console.error);
    },
    [workspace?.id, processSettingsQueue],
  );

  const handleUpdateRoleLocal = useCallback(
    async (id: string, role: UserRole) => {
      await updateRole(id, role);
      setProfiles(prev => prev.map(p => (p.id === id ? { ...p, role } : p)));
    },
    [updateRole],
  );

  const value = useMemo<OperationalDataContextValue>(
    () => ({
      raw,
      derived,
      governanceCache,
      loading,
      dbNotifications,
      setProjects,
      refreshAll,
      refreshProjects,
      refreshAttendance,
      
      handleSaveLogisticsData,
      handleCreateTeam,
      handleUpdateTeam,
      handleDeleteTeam,
      handleUpdateRole: handleUpdateRoleLocal,
      markNotificationRead,
      fetchNotifications,
      updateWorkspaceSettings,
      taskActions: { addDependency, removeDependency, updateTaskDates, updateTask, addTask, updateTaskStatus, deleteTask },
    }),
    [
      raw,
      derived,
      governanceCache,
      loading,
      dbNotifications,
      refreshAll,
      refreshProjects,
      refreshAttendance,
      
      handleSaveLogisticsData,
      handleCreateTeam,
      handleUpdateTeam,
      handleDeleteTeam,
      handleUpdateRoleLocal,
      markNotificationRead,
      fetchNotifications,
      updateWorkspaceSettings,
      addDependency,
      removeDependency,
      updateTaskDates,
      updateTask,
    ],
  );

  useEffect(() => {
    // FIX 7: Dependency graph snapshot
    if (workspace?.id && dependencies.length > 0) {
      DataGovernanceEngine.snapshotDependencyGraph(workspace.id, dependencies).catch(console.error);
    }
  }, [workspace?.id, dependencies.length]); // Snapshot when dependency count changes

  return (
    <OperationalDataContext.Provider value={value}>{children}</OperationalDataContext.Provider>
  );
}

export function useOperationalData() {
  const ctx = useContext(OperationalDataContext);
  if (!ctx) {
    throw new Error('useOperationalData must be used within OperationalDataProvider');
  }
  return ctx;
}

export function useOperationalRaw() {
  return useOperationalData().raw;
}

export function useOperationalDerived() {
  return useOperationalData().derived;
}
