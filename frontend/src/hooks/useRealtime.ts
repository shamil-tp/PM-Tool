import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { dedupPayload } from '../lib/realtimeDedup';
import type { RealtimePostgresChangesPayload } from '../lib/supabase';

type EventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions {
  table: string;
  event?: EventType;
  filter?: string;
  onChange: (payload: RealtimePostgresChangesPayload<any>) => void;
  enabled?: boolean;
}

export function useRealtime({ table, event = '*', filter, onChange, enabled = true }: UseRealtimeOptions) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) {
      setStatus('error');
      return;
    }

    const channel = supabase
      .channel(`realtime:${table}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes' as any,
        { event, schema: 'public', table, filter },
        (payload: RealtimePostgresChangesPayload<any>) => {
          dedupPayload(payload, () => onChangeRef.current(payload));
        }
      )
      .subscribe((status) => {
        setStatus(status === 'SUBSCRIBED' ? 'connected' : 'connecting');
      });

    return () => {
      supabase.removeChannel(channel);
      setStatus('error');
    };
  }, [table, event, filter, enabled]);

  return status;
}

export function useActivityRealtime(wsId: string | undefined, onEvent: (payload: RealtimePostgresChangesPayload<any>) => void) {
  return useRealtime({
    table: 'activity_logs',
    event: 'INSERT',
    filter: wsId ? `workspace_id=eq.${wsId}` : undefined,
    onChange: onEvent,
    enabled: !!wsId,
  });
}

export function useTasksRealtime(wsId: string | undefined, onEvent: (payload: RealtimePostgresChangesPayload<any>) => void) {
  return useRealtime({
    table: 'tasks',
    filter: wsId ? `workspace_id=eq.${wsId}` : undefined,
    onChange: onEvent,
    enabled: !!wsId,
  });
}

export function useApprovalsRealtime(wsId: string | undefined, onEvent: (payload: RealtimePostgresChangesPayload<any>) => void) {
  return useRealtime({
    table: 'approval_instances',
    filter: wsId ? `workspace_id=eq.${wsId}` : undefined,
    onChange: onEvent,
    enabled: !!wsId,
  });
}
