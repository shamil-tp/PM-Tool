import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Clock, User } from 'lucide-react';
import { slideUp, fastTransition } from '../../lib/animation';
import { groupActivityEntries } from '../../lib/activityGroup';
import { WidgetCard } from './WidgetCard';

interface ActivityEntry {
  id: string;
  actor_id?: string;
  action: string;
  target_type?: string;
  target_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
  actor_name?: string;
}

interface ActivityFeedProps {
  entries: ActivityEntry[];
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void };
  onItemClick?: (entry: ActivityEntry) => void;
  maxItems?: number;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function actionLabel(action: string, count: number): string {
  const labels: Record<string, string> = {
    task_created: 'created task',
    task_updated: 'updated task',
    task_completed: 'completed task',
    project_created: 'created project',
    document_created: 'created document',
    sprint_started: 'started sprint',
    automation_executed: 'ran automation',
    integration_synced: 'synced integration',
    approval_submitted: 'submitted approval',
    approval_resolved: 'resolved approval',
    file_uploaded: 'uploaded file',
    file_replaced: 'replaced file',
    version_restored: 'restored file version',
    file_archived: 'archived file',
  };
  const base = labels[action] || action.replace(/_/g, ' ');
  return count > 1 ? `${base} ${count}x` : base;
}

function severityClass(action: string): string {
  const h = ['task_completed', 'approval_resolved', 'integration_synced', 'version_restored'];
  const m = ['task_created', 'project_created', 'sprint_started', 'automation_executed', 'file_uploaded', 'file_replaced'];
  if (h.includes(action)) return 'border-l-emerald-500/30';
  if (m.includes(action)) return 'border-l-amber-500/20';
  return 'border-l-white/5';
}

export function ActivityFeed({ entries, loading, error, emptyMessage, emptyAction, onItemClick, maxItems = 30 }: ActivityFeedProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const feedRef = useRef<HTMLDivElement>(null);
  const isAtTopRef = useRef(true);

  const grouped = useMemo(() => groupActivityEntries(entries).slice(0, maxItems), [entries, maxItems]);

  const handleScroll = useCallback(() => {
    if (!feedRef.current) return;
    isAtTopRef.current = feedRef.current.scrollTop < 30;
  }, []);

  useEffect(() => {
    if (feedRef.current && isAtTopRef.current && grouped.length > 0) {
      feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [grouped.length]);

  const toggleExpand = (groupId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <WidgetCard
      title="Activity"
      loading={loading}
      error={error}
      empty={!loading && !error && grouped.length === 0}
      emptyMessage={emptyMessage || 'No recent activity'}
      emptyAction={emptyAction}
    >
      <div ref={feedRef} onScroll={handleScroll} className="space-y-0.5 max-h-[380px] overflow-y-auto scrollbar-thin">
        <AnimatePresence initial={false}>
          {grouped.map((group) => {
            const isExpanded = expanded.has(group.id);
            return (
              <motion.div
                key={group.id}
                variants={slideUp}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.15 }}
                layout
              >
                <div
                  className={`flex items-start gap-2 px-3 py-2 rounded group cursor-pointer hover:bg-surface-3 transition-colors border-l-2 ${severityClass(group.action)}`}
                  onClick={() => {
                    if (group.count > 1) toggleExpand(group.id);
                    else if (onItemClick) onItemClick(group.entries[0]);
                  }}
                >
                  <div className="w-5 h-5 rounded-full bg-[var(--pm-surface)]/5 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3 h-3 text-text-quaternary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-mono text-text-secondary truncate">
                      {group.actor_name || 'System'} {actionLabel(group.action, group.count)}
                    </div>
                    {group.target_type && (
                      <div className="text-[10px] font-mono text-text-quaternary truncate">{group.target_type}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-mono text-text-quaternary shrink-0">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{timeAgo(group.created_at)}</span>
                    {group.count > 1 && (
                      <ChevronDown
                        className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    )}
                  </div>
                </div>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="overflow-hidden"
                    >
                      {group.entries.map((e) => (
                        <div
                          key={e.id}
                          className="flex items-start gap-2 pl-10 pr-3 py-1.5 cursor-pointer hover:bg-surface-3 transition-colors"
                          onClick={() => onItemClick?.(e)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-mono text-text-tertiary truncate">{e.action}</div>
                          </div>
                          <div className="text-[9px] font-mono text-text-quaternary shrink-0">{timeAgo(e.created_at)}</div>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </WidgetCard>
  );
}
