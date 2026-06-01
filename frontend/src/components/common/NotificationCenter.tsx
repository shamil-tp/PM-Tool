import React, { useState } from 'react';
import { Bell, Check, Archive, AlertTriangle, Info, ShieldAlert, AtSign, CheckSquare, FileText, Activity, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOperationalData } from '../../context/OperationalDataContext';
import { supabase } from '../../lib/supabase';
import { activityLogService } from '../../services/activityLogService';
import { useWorkspace } from '../../context/WorkspaceContext';

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const { workspace } = useWorkspace() as any;
  const { dbNotifications = [] } = useOperationalData();

  const activeNotifications = dbNotifications.filter(n => !n.read_at);
  const unreadCount = activeNotifications.length;

  const getCategoryGroup = (n: any) => {
    // Determine category based on 'type' or fallback to 'category'
    const type = n.type || n.category;
    
    if (['approval', 'assignments', 'assigned_work'].includes(type)) return 'Needs Attention';
    if (['mention'].includes(type)) return 'Mentions';
    if (['comment', 'status_change', 'document_update', 'deadlines'].includes(type)) return 'Updates';
    if (['risk', 'automation', 'capacity', 'system', 'attendance'].includes(type)) return 'System';
    
    return 'Updates'; // Default
  };

  const categorized = dbNotifications.slice(0, 50).reduce((acc: any, n: any) => {
    const group = getCategoryGroup(n);
    if (!acc[group]) acc[group] = [];
    acc[group].push(n);
    return acc;
  }, {});

  const markAllRead = async () => {
    const unreadIds = activeNotifications.map(n => n.id);
    if (unreadIds.length === 0) return;
    
    await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds);

    if (workspace?.id) {
      activityLogService.appendLog({
        workspace_id: workspace.id,
        actor_id: 'system',
        action: 'notifications_cleared',
        metadata: { count: unreadIds.length }
      }).catch(() => {});
    }
  };

  const markRead = async (id: string) => {
    await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
  };

  const markOpened = async (id: string) => {
    await supabase.from('notifications')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', id);
  };

  const dismiss = async (id: string) => {
    await supabase.from('notifications')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', id);
    if (workspace?.id) {
      activityLogService.appendLog({
        workspace_id: workspace.id,
        actor_id: 'system',
        action: 'notification_dismissed',
        metadata: { notification_id: id }
      }).catch(() => {});
    }
  };

  const toggleOpen = () => setIsOpen(!isOpen);

  const getIcon = (type: string) => {
    switch (type) {
      case 'mention': return <AtSign className="w-4 h-4 text-accent-primary" />;
      case 'approval': return <CheckSquare className="w-4 h-4 text-signal-safe" />;
      case 'comment': return <FileText className="w-4 h-4 text-accent-secondary" />;
      case 'risk': return <AlertTriangle className="w-4 h-4 text-signal-warning" />;
      case 'automation': return <Zap className="w-4 h-4 text-accent-tertiary" />;
      case 'capacity': return <Activity className="w-4 h-4 text-signal-critical" />;
      case 'error': return <ShieldAlert className="w-4 h-4 text-signal-critical" />;
      default: return <Info className="w-4 h-4 text-signal-info" />;
    }
  };

  const handleNavigate = (n: any) => {
    if (n.route_path) {
      window.location.hash = `#${n.route_path}`;
      console.log('Navigating to exact route:', n.route_path);
    } else if (n.source_entity_type && n.source_entity_id) {
      // Fallback navigation using source_entity fields
      window.location.hash = `#/${n.source_entity_type}/${n.source_entity_id}`;
      console.log('Navigating to', n.source_entity_type, n.source_entity_id);
    }
    if (!n.read_at) markRead(n.id);
    if (!n.opened_at) markOpened(n.id);
  };

  return (
    <div className="relative">
      <button onClick={toggleOpen} className="relative p-2 rounded-lg hover:bg-surface-2 transition-colors border border-transparent hover:border-[var(--pm-border)]">
        <Bell className="w-5 h-5 text-text-secondary" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-signal-critical rounded-full border border-[var(--pm-surface)] shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 w-96 bg-[var(--pm-surface)] border border-[var(--pm-border)] rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col max-h-[500px]"
          >
            <div className="flex items-center justify-between p-3 border-b border-[var(--pm-border)] bg-surface-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-primary">Notifications</h3>
              <button onClick={markAllRead} className="text-[10px] font-bold uppercase tracking-wider text-accent-primary hover:text-accent-primary/80 transition-colors">
                Mark all read
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {Object.keys(categorized).length === 0 ? (
                <div className="p-8 text-center text-[11px] font-mono uppercase text-text-quaternary">
                  All caught up!
                </div>
              ) : (
                <div className="flex flex-col gap-2 p-2">
                  {['Needs Attention', 'Mentions', 'Updates', 'System'].map(group => {
                    const notes = categorized[group];
                    if (!notes || notes.length === 0) return null;
                    return (
                      <div key={group} className="mb-2">
                        <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-text-tertiary mb-1">
                          {group}
                        </div>
                        <div className="flex flex-col gap-1">
                          {notes.map((n: any) => (
                            <div 
                              key={n.id} 
                              onClick={() => handleNavigate(n)}
                              className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-surface-2 ${!n.read_at ? 'border-accent-primary/30 bg-accent-primary/5' : 'border-transparent'}`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 shrink-0">
                                  {getIcon(n.type || n.category)}
                                </div>
                                <div className="flex-1">
                                  <h4 className={`text-xs font-bold ${!n.read_at ? 'text-text-primary' : 'text-text-secondary'}`}>{n.title}</h4>
                                  <p className="text-[11px] text-text-tertiary mt-0.5 leading-snug">{n.message || n.body}</p>
                                  <span className="text-[9px] text-text-quaternary mt-1 block">{new Date(n.created_at).toLocaleString()}</span>
                                </div>
                                <div className="shrink-0 flex flex-col gap-1">
                                  <button onClick={(e) => { e.stopPropagation(); dismiss(n.id); }} className="p-1 hover:bg-surface-3 rounded text-text-quaternary hover:text-signal-critical transition-colors" title="Dismiss">
                                    <Archive className="w-3 h-3" />
                                  </button>
                                  {!n.read_at && (
                                    <button onClick={(e) => { e.stopPropagation(); markRead(n.id); }} className="p-1 hover:bg-surface-3 rounded text-text-quaternary hover:text-signal-safe transition-colors" title="Mark Read">
                                      <Check className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
