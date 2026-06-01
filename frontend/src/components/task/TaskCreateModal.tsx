import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Terminal } from 'lucide-react';
import { Project, TaskStatus } from '../../types';
import { AssigneePicker } from './AssigneePicker';

interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  users: any[];
  defaultStatus: TaskStatus;
  defaultProjectId?: string;
  mode?: 'task' | 'epic' | 'story';
  onSubmit: (task: {
    project_id: string;
    name: string;
    description: string;
    estimated_hours: number;
    assignee_id?: string;
    status: TaskStatus;
    priority: 'medium';
    recurrence_type?: string;
  }) => Promise<void>;
  notify: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export function TaskCreateModal({
  isOpen,
  onClose,
  projects,
  users,
  defaultStatus,
  defaultProjectId,
  mode = 'task',
  onSubmit,
  notify
}: TaskCreateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [estimatedHours, setEstimatedHours] = useState(5);
  const [assigneeId, setAssigneeId] = useState('');
  const [recurrenceType, setRecurrenceType] = useState('none');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !projectId) {
      notify("Workspace error: Title and targeted Project are mandatory.", "error");
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        project_id: projectId,
        name,
        description,
        estimated_hours: Number(estimatedHours),
        assignee_id: assigneeId || undefined,
        status: defaultStatus,
        priority: 'medium',
        recurrence_type: recurrenceType,
      });
      
      notify(`Task "${name}" queued successfully.`, "success");
      onClose();
      // Reset form
      setName('');
      setDescription('');
      setEstimatedHours(5);
      setAssigneeId('');
      setRecurrenceType('none');
    } catch (err: any) {
      notify(`Failed to queue task: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[var(--pm-surface)] dark:bg-black/60 backdrop-blur-md z-[99999] flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="bg-surface border border-[var(--pm-border)] dark:border-white/10 p-8 rounded-2xl w-full max-w-md relative overflow-hidden shadow-2xl"
      >
        {/* Visual glow accent */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent-primary via-accent-secondary to-accent-primary" />
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-accent-primary/20 blur-[80px] rounded-full pointer-events-none" />
        
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-sm font-semibold tracking-wide uppercase text-text-primary flex items-center gap-2">
            <Terminal className="w-5 h-5 text-accent-primary drop-shadow-[0_0_8px_rgba(var(--color-accent-primary-rgb),0.5)]" />
            {mode === 'epic' ? 'Add Epic' : mode === 'story' ? 'Add Story' : 'Add Task'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--pm-surface)]/5 text-text-quaternary hover:text-text-primary transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-medium uppercase tracking-widest text-text-tertiary">
              {mode === 'epic' ? 'Epic Name' : mode === 'story' ? 'Story Title' : 'Task Title'} <span className="text-signal-error">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Implement Authentication"
              className="w-full bg-surface-2 border border-border/50 p-2.5 text-sm font-medium text-text-primary placeholder-white/20 focus:border-accent-primary/70 focus:bg-surface-3 outline-none transition-all rounded-lg shadow-inner"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-medium uppercase tracking-widest text-text-tertiary">
              Target Project <span className="text-signal-error">*</span>
            </label>
            {defaultProjectId ? (
              <div className="w-full bg-surface-2/50 border border-border/30 p-2.5 text-sm text-text-secondary rounded-lg">
                {projects.find(p => p.id === defaultProjectId)?.name || projects[0]?.name}
              </div>
            ) : (
              <select
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full bg-surface-2 border border-border/50 p-2.5 text-sm font-medium text-text-primary focus:border-accent-primary/70 focus:bg-surface-3 outline-none transition-all rounded-lg appearance-none cursor-pointer"
              >
                <option value="">-- SELECT PROJECT --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-medium uppercase tracking-widest text-text-tertiary">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Technical specs, links, etc."
              rows={3}
              className="w-full bg-surface-2 border border-border/50 p-2.5 text-sm font-medium text-text-primary placeholder-white/20 focus:border-accent-primary/70 focus:bg-surface-3 outline-none transition-all resize-none rounded-lg shadow-inner"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1 space-y-1.5">
              <label className="block text-[10px] font-medium uppercase tracking-widest text-text-tertiary">Weight (Hours)</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(Number(e.target.value))}
                className="w-full bg-surface-2 border border-border/50 p-2.5 text-sm font-medium text-text-primary focus:border-accent-primary/70 focus:bg-surface-3 outline-none transition-all rounded-lg shadow-inner"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="block text-[10px] font-medium uppercase tracking-widest text-text-tertiary">Assignee</label>
                <AssigneePicker
                  users={users}
                  value={assigneeId}
                  onChange={setAssigneeId}
                  contextText={`${name} ${description}`}
                />
            </div>
            {mode === 'task' && (
              <div className="flex-1 space-y-1.5">
                <label className="block text-[10px] font-medium uppercase tracking-widest text-text-tertiary">Repeat</label>
                <select
                  value={recurrenceType}
                  onChange={(e) => setRecurrenceType(e.target.value)}
                  className="w-full bg-surface-2 border border-border/50 p-2.5 text-sm font-medium text-text-primary focus:border-accent-primary/70 focus:bg-surface-3 outline-none transition-all rounded-lg appearance-none cursor-pointer"
                >
                  <option value="none">Never</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            )}
          </div>

          <div className="pt-6 mt-4 flex justify-end gap-3 border-t border-[var(--pm-border)] dark:border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-text-tertiary hover:text-text-primary hover:bg-[var(--pm-surface)]/5 rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-accent-primary hover:bg-accent-primary/90 text-[var(--pm-text)] dark:text-white text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all shadow-[0_0_15px_rgba(var(--color-accent-primary-rgb),0.3)] hover:shadow-[0_0_20px_rgba(var(--color-accent-primary-rgb),0.5)] disabled:opacity-50 disabled:shadow-none"
            >
              {isSubmitting ? 'Processing...' : mode === 'epic' ? 'Create Epic' : mode === 'story' ? 'Create Story' : 'Create Task'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
