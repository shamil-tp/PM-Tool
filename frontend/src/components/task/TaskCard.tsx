import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, ArrowRight, ArrowUp, AlertTriangle, Clock, Users, Shield, Link2, MoreHorizontal, Edit2 } from 'lucide-react';
import { Task, Project } from '../../types';
import { getTaskDeadline } from '../../core/types/temporal';
import { calculateTaskCountdown } from '../../services/etaService';

interface TaskCardProps {
  task: Task;
  project?: Project;
  hasWriteAccess: boolean;
  columns: { id: string; title: string; color: string }[];
  onTransitionTask: (taskId: string, targetStatus: Task['status']) => void;
  onEditTask?: (task: Task) => void;
  onPromoteToAsset?: (task: { title: string; description: string; projectId: string }) => void;
  onClick: (task: Task) => void;
  assigneeProfile?: { full_name?: string; email?: string; avatar_url?: string; role?: string; availability_factor?: number } | null;
  assigneeLoading?: boolean;
  blockedByTasks?: string[];
  dependencyConfidence?: number;
  density?: 'comfortable' | 'compact' | 'executive';
  substate?: string;
  blockers?: any[];
  onOpenWaitState?: (task: Task) => void;
}

export function TaskCard({
  task,
  project,
  hasWriteAccess,
  columns,
  onTransitionTask,
  onEditTask,
  onPromoteToAsset,
  onClick,
  assigneeProfile,
  assigneeLoading,
  blockedByTasks,
  dependencyConfidence,
  density = 'comfortable',
  substate,
  blockers,
  onOpenWaitState
}: TaskCardProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const countdown = calculateTaskCountdown(task.created_at, task.estimated_hours, task.status);

  const riskColors: Record<string, string> = {
    high: 'text-signal-critical bg-signal-critical-bg border-signal-critical/20',
    medium: 'text-signal-warning bg-signal-warning-bg border-signal-warning/20',
    low: 'text-signal-safe bg-signal-safe-bg border-signal-safe/20'
  };

  const priorityColors: Record<string, string> = {
    high: 'text-signal-critical',
    medium: 'text-signal-warning',
    low: 'text-signal-safe'
  };

  const isCompact = density === 'compact';
  const isExecutive = density === 'executive';

  // Real-time metrics calculations
  const elapsedDays = (Date.now() - new Date(task.created_at).getTime()) / (1000 * 60 * 60 * 24);
  const estimatedDays = (task.estimated_hours || 0) / 8;
  const drift = elapsedDays - estimatedDays;
  const isOverdue = task.estimated_hours > 0 && drift > 0;
  const isStalled = isOverdue || (blockedByTasks && blockedByTasks.length > 0) || task.status === 'review';
  const elapsedHours = elapsedDays * 24;

  // Systemic liability resolution
  let liabilityTag = null;
  const taskStatusString = task.status as string;
  if (taskStatusString === 'blocked' || taskStatusString === 'passive_wait') {
    liabilityTag = 'Liability: External Client';
  } else if (taskStatusString === 'review') {
    liabilityTag = 'Liability: Compliance Review';
  } else if (task.name.toLowerCase().includes('client') || task.name.toLowerCase().includes('server setup')) {
    liabilityTag = 'Liability: External Client';
  }

  // Active Blocker Tracking
  const activeBlocker = blockers?.find(b => b.task_id === task.id && !b.resolved);
  const blockerDurationDays = activeBlocker 
    ? (Date.now() - new Date(activeBlocker.created_at).getTime()) / (1000 * 60 * 60 * 24) 
    : 0;

  return (
    <motion.div
      onClick={() => onClick(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(task);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Task: ${task.name}. Status: ${task.status}.`}
      className={`group relative shrink-0 w-full pm-card task-card overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] ${isCompact ? 'p-2' : isExecutive ? 'p-5' : 'p-3.5'
        }`}
    >
      {/* Risk indicator side bar */}
      {task.risk && task.risk !== 'low' && (
        <div className={`absolute top-0 bottom-0 left-0 w-1 ${task.risk === 'high' ? 'bg-signal-critical' : 'bg-signal-warning'}`} />
      )}

      <div className="flex flex-col gap-2">
        {/* Top metadata */}
        {!isCompact && (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="text-[10px] font-medium text-text-tertiary truncate">
                {project?.name || 'No Project'}
              </span>
              {task.epic_id && (
                <>
                  <span className="text-text-quaternary">/</span>
                  <span className="text-[10px] font-medium text-accent-secondary truncate uppercase tracking-tight">
                    Epic
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {substate && (
                <span className="bg-[var(--pm-surface-high)] text-[var(--pm-primary)] border border-border text-[8px] font-semibold font-mono-pm px-1 py-0.5 rounded uppercase leading-none">
                  {substate.replace(/_/g, ' ')}
                </span>
              )}
              {task.priority && (
                <div className={`w-1.5 h-1.5 rounded-full ${priorityColors[task.priority] || 'bg-text-tertiary'}`} title={`Priority: ${task.priority}`} />
              )}
              <MoreHorizontal className="w-3.5 h-3.5 text-text-quaternary opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        )}

        {/* Title */}
        <div className="flex justify-between items-start gap-2">
          <h4 className={`font-semibold leading-snug transition-colors ${isCompact ? 'text-[11px]' : isExecutive ? 'text-[13px]' : 'text-[12px]'
            }`} style={{ color: 'var(--pm-on-surface)' }}>
            {task.name}
          </h4>
        </div>

        {/* Dynamic Timeline Tracking Row */}
        {task.estimated_hours > 0 && !isCompact && (
          <div className="w-full mt-1.5 mb-0.5 group/timeline relative">
            <div className="w-full h-1 bg-surface-3 rounded-full overflow-hidden opacity-60 group-hover/timeline:opacity-100 transition-opacity">
              <div
                className={`h-full rounded-full transition-all ${isOverdue ? 'bg-signal-critical' : 'bg-accent-secondary'}`}
                style={{ width: `${Math.min(100, (elapsedHours / task.estimated_hours) * 100)}%` }}
              />
            </div>
            <div className="absolute hidden group-hover/timeline:flex -top-5 left-0 text-[9px] font-mono-pm uppercase tracking-widest text-text-tertiary bg-surface-high p-1 rounded shadow-sm z-10">
              Elapsed: {elapsedHours.toFixed(1)}h / {task.estimated_hours.toFixed(1)}h
            </div>
          </div>
        )}

        {/* Description */}
        {!isCompact && task.description && (
          <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--pm-on-surface-variant)' }}>
            {task.description}
          </p>
        )}

        {/* Middle Stats/Badges - Simplified for visual calmness */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {task.risk && task.risk !== 'low' && (
            <span className={`flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded ${riskColors[task.risk]}`}>
              <AlertTriangle className="w-2.5 h-2.5" />
              {task.risk}
            </span>
          )}

          {activeBlocker && (
            <span className="flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono-pm">
              <Clock className="w-2.5 h-2.5" />
              {blockerDurationDays.toFixed(1)}d
            </span>
          )}

          {drift > 0 && task.status !== 'done' && (
            <span className="flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded text-signal-warning bg-signal-warning-bg/50" title={`Timeline drift of ${drift.toFixed(1)} days detected.`}>
              +{drift.toFixed(0)}d drift
            </span>
          )}

          {task.story_points && (
            <span className="text-[9px] font-mono-pm px-1.5 py-0.5 rounded text-text-quaternary">
              {task.story_points} SP
            </span>
          )}

          {(task.deadline || task.due_date) && (
            <span className="flex items-center gap-0.5 text-[9px] font-medium text-text-tertiary">
              <Clock className="w-2.5 h-2.5" />
              {new Date(getTaskDeadline(task)!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center mt-1 pt-2 border-t border-border-subtle">
          <div className="flex items-center gap-2">
            {assigneeProfile ? (
              <div className="flex items-center gap-1.5">
                {assigneeProfile.avatar_url ? (
                  <img src={assigneeProfile.avatar_url} className="w-4 h-4 rounded-full border border-border" alt="" />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-surface-3 border border-border flex items-center justify-center">
                    <User className="w-2.5 h-2.5 text-text-tertiary" />
                  </div>
                )}
                {!isCompact && (
                  <span className="text-[10px] font-medium text-text-secondary truncate max-w-[80px]">
                    {assigneeProfile.full_name?.split(' ')[0] || assigneeProfile.email?.split('@')[0]}
                  </span>
                )}
              </div>
            ) : (
              <div className="w-4 h-4 rounded-full border border-dashed border-border flex items-center justify-center">
                <User className="w-2.5 h-2.5 text-text-quaternary" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {task.status !== 'done' && (
              <div className={`text-[10px] font-medium ${countdown.color === 'text-rose-400' ? 'text-signal-critical' : 'text-text-tertiary'}`}>
                {countdown.text.replace('ETA: ', '')}
              </div>
            )}

            {hasWriteAccess && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1 bg-surface-2 rounded border border-border p-0.5 shadow-sm">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onEditTask) {
                      onEditTask(task);
                    }
                  }}
                  className="p-1 hover:bg-surface-3 rounded transition-colors text-text-tertiary hover:text-accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary"
                  title="Edit task"
                  aria-label={`Edit task ${task.name}`}
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <div className="w-px h-3 bg-border-subtle mx-0.5" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const currentIndex = columns.findIndex(c => c.id === task.status);
                    const prevIndex = Math.max(0, currentIndex - 1);
                    if (prevIndex !== currentIndex) {
                      onTransitionTask(task.id, columns[prevIndex].id as Task['status']);
                    }
                  }}
                  className="p-1 hover:bg-surface-3 rounded transition-colors text-text-tertiary hover:text-text-primary"
                  title="Move backward"
                >
                  <ArrowRight className="w-3 h-3 rotate-180" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const currentIndex = columns.findIndex(c => c.id === task.status);
                    const nextIndex = Math.min(columns.length - 1, currentIndex + 1);
                    if (nextIndex !== currentIndex) {
                      onTransitionTask(task.id, columns[nextIndex].id as Task['status']);
                    }
                  }}
                  className="p-1 hover:bg-surface-3 rounded transition-colors text-text-tertiary hover:text-text-primary"
                  title="Move forward"
                >
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Action Bar */}
        {hasWriteAccess && onOpenWaitState && task.status !== 'done' && !isCompact && (
          <div className="mt-2 pt-2 border-t border-border-subtle flex justify-between items-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenWaitState(task);
              }}
              className="flex items-center gap-1.5 px-2 py-1 bg-surface-2 hover:bg-amber-500/10 text-text-quaternary hover:text-amber-400 text-[10px] font-mono-pm uppercase tracking-wide rounded border border-border hover:border-amber-500/30 transition-colors cursor-pointer"
            >
              <Clock className="w-3 h-3" />
              Log Delay
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

