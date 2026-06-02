import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '../lib/supabase';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { createWorkspaceForUser, getWorkspaceForUser, updateWorkspaceSettings as persistWorkspaceSettings, rowToWorkspace } from '../services/workspaceService';
import type { Workspace, WorkspaceSettings } from '../types/workspace';
import { useAuth } from './AuthContext';
import { hasCapability } from '../core/auth/permissions';
import { buildOAuthRedirectUrl, setRedirectToAfterAuth } from '../core/auth/postAuthRedirect';
import { holidaySourceService } from '../services/holidaySourceService';

interface WorkspaceContextValue {
  user: User | null;
  workspace: Workspace | null;
  settings: WorkspaceSettings | null;
  loading: boolean;
  error: string | null;
  refreshWorkspace: () => Promise<void>;
  createWorkspace: (input: CreateWorkspaceInput) => Promise<Workspace>;
  updateWorkspaceSettings: (settings: Partial<WorkspaceSettings>) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export interface CreateWorkspaceInput {
  name: string;
  settings: WorkspaceSettings;
  templateId?: string;
  executionMode?: string;
  defaultLanes?: number;
  workflowRules?: Record<string, any>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { profile, loading: authLoading } = useAuth();

  const refreshWorkspace = useCallback(async () => {
    if (import.meta.env.DEV) {
      console.log("WorkspaceContext: refreshWorkspace() called");
    }
    if (!isSupabaseConfigured || !profile?.workspace_id) {
      setWorkspace(null);
      return;
    }

    try {
      const { data: workspaceRow, error: workspaceError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', profile.workspace_id)
        .maybeSingle();

      if (workspaceError) throw workspaceError;
      if (workspaceRow) {
        setWorkspace(rowToWorkspace(workspaceRow as any));
      } else {
        setWorkspace(null);
      }
    } catch (err: any) {
      console.error('WorkspaceContext: refreshWorkspace failed:', err);
      setError(err?.message || 'Workspace lookup failed.');
      setWorkspace(null);
    }
  }, [profile?.workspace_id]);

  useEffect(() => {
    // console.log("[WorkspaceContext useEffect TRIGGERED]: authLoading:", authLoading, "profile:", profile ? profile.email : "null");
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!isSupabaseConfigured) {
      console.warn("[WorkspaceContext]: Supabase not configured, skipping");
      setWorkspace(null);
      setLoading(false);
      return;
    }

    if (!profile) {
      console.log("[WorkspaceContext]: profile is null, resetting user/workspace and stopping load");
      setUser(null);
      setWorkspace(null);
      setLoading(false);
      return;
    }

    // Align active user with profile identity
    // console.log("[WorkspaceContext]: setting user to profile:", profile.email);
    setUser(profile as any);

    if (!profile.workspace_id) {
      console.log("[WorkspaceContext]: profile has no workspace_id, stopping load");
      setWorkspace(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let active = true;

    const loadWorkspace = async () => {
      try {
        const { data: workspaceRow, error: workspaceError } = await supabase
          .from('workspaces')
          .select('*')
          .eq('id', profile.workspace_id)
          .maybeSingle();

        if (!active) {
          return;
        }

        if (workspaceError) throw workspaceError;
        if (workspaceRow) {
          const parsed = rowToWorkspace(workspaceRow as any);
          setWorkspace(prev => {
            if (prev && prev.id !== workspaceRow.id) {
              supabase.removeAllChannels();
            }
            return parsed;
          });

          // Auto-fetch next year's holidays in background (owner / super_admin only)
          if (parsed.settings?.country && profile && (profile.id === parsed.ownerId || hasCapability(profile.role, 'manage_settings'))) {
            holidaySourceService.checkAndSyncNextYear(parsed.id, parsed.settings.country, parsed.settings.region || '', profile?.id).catch(() => {});
          } else if (parsed.settings?.country) {
            console.log('[Calendar Sync] skipped: non-owner');
          }

          // Wave 8: Trigger Audit Integrity Verification
          import('../core/observability/ObservabilityEngine').then(({ ObservabilityEngine }) => {
            ObservabilityEngine.verifyAuditLedger(supabase, parsed.id);
          });
        } else {
          setWorkspace(null);
        }
      } catch (err: any) {
        console.error("WorkspaceContext load workspace error:", err);
        if (active) {
          setWorkspace(null);
          setError(err?.message || 'Workspace lookup failed.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadWorkspace();

    // Bulletproof fallback to absolutely prevent infinite loading screens
    // Extended to 15s to support cold starts and network delays on reload.
    const safetyTimeout = setTimeout(() => {
       if (active) {
         setLoading(false);
       }
    }, 15000);

    return () => {
      active = false;
      clearTimeout(safetyTimeout);
    };
  }, [profile, authLoading]);

  const createWorkspace = useCallback(async ({ name, settings, templateId, executionMode, defaultLanes, workflowRules }: CreateWorkspaceInput) => {
    if (!user) throw new Error('You must be signed in to create a workspace.');
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

    setError(null);

    try {
      const nextWorkspace = await createWorkspaceForUser({ name, settings, user, templateId, executionMode, defaultLanes, workflowRules });
      setWorkspace(nextWorkspace);
      return nextWorkspace;
    } catch (err: any) {
      setError(err?.message || 'Workspace creation failed.');
      throw err;
    }
  }, [user]);

  const updateWorkspaceSettings = useCallback(async (settings: Partial<WorkspaceSettings>) => {
    if (!workspace) throw new Error('No workspace is active.');

    try {
      setWorkspace(await persistWorkspaceSettings(workspace, settings, profile?.id));
    } catch (err: any) {
      setError(err?.message || 'Workspace update failed.');
      throw err;
    }
  }, [workspace, profile?.id]);

  const signInWithGoogle = useCallback(async () => {
    setRedirectToAfterAuth('/overview');

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: buildOAuthRedirectUrl(),
      },
    });

    if (signInError) {
      setError(signInError.message);
      throw signInError;
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setWorkspace(null);
  }, []);

  const value = useMemo<WorkspaceContextValue>(() => ({
    user,
    workspace,
    settings: workspace?.settings || null,
    loading,
    error,
    refreshWorkspace,
    createWorkspace,
    updateWorkspaceSettings,
    signInWithGoogle,
    signOut
  }), [user, workspace, loading, error, refreshWorkspace, createWorkspace, updateWorkspaceSettings, signInWithGoogle, signOut]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider.');
  }
  return context;
}
