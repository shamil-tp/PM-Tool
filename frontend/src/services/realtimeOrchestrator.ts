import { supabase, createRealtimeChannel } from '../lib/supabase';
import type { RealtimeChannel } from '../lib/supabase';

class RealtimeOrchestrator {
  private channels: Map<string, RealtimeChannel> = new Map();
  private subscribers: Map<string, Set<(payload: any) => void>> = new Map();
  
  public subscribe(
    channelId: string,
    table: string,
    filter: string,
    onMessage: (payload: any) => void
  ): () => void {
    if (!this.subscribers.has(channelId)) {
      this.subscribers.set(channelId, new Set());
    }
    
    this.subscribers.get(channelId)!.add(onMessage);
    
    if (!this.channels.has(channelId)) {
      const channel = createRealtimeChannel(channelId)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter },
          (payload) => {
            const callbacks = this.subscribers.get(channelId);
            if (callbacks) {
              callbacks.forEach(cb => cb(payload));
            }
          }
        )
        .subscribe((status, err) => {
          import('../core/observability/ObservabilityEngine').then(({ ObservabilityEngine }) => {
            if (status === 'SUBSCRIBED') {
              ObservabilityEngine.updateRealtimeHealth({ status: 'healthy', activeChannels: this.channels.size });
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
              ObservabilityEngine.updateRealtimeHealth({ status: 'offline', lastDisconnect: new Date().toISOString() });
            } else if (status === 'TIMED_OUT') {
              ObservabilityEngine.updateRealtimeHealth({ status: 'degraded' });
            }
          });
        });
        
      this.channels.set(channelId, channel);
      import('../core/observability/ObservabilityEngine').then(({ ObservabilityEngine }) => {
        ObservabilityEngine.updateRealtimeHealth({ activeChannels: this.channels.size });
      });
    }
    
    return () => this.unsubscribe(channelId, onMessage);
  }
  
  private unsubscribe(channelId: string, onMessage: (payload: any) => void) {
    const callbacks = this.subscribers.get(channelId);
    if (callbacks) {
      callbacks.delete(onMessage);
      if (callbacks.size === 0) {
        this.subscribers.delete(channelId);
        const channel = this.channels.get(channelId);
        if (channel) {
          supabase.removeChannel(channel);
          this.channels.delete(channelId);
        }
      }
    }
  }
  
  public disconnectAll() {
    this.channels.forEach(channel => {
      supabase.removeChannel(channel);
    });
    this.channels.clear();
    this.subscribers.clear();
  }
}

export const realtimeOrchestrator = new RealtimeOrchestrator();
