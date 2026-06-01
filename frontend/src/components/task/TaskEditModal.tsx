import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Terminal } from 'lucide-react';
import { Project, Task, TaskStatus } from '../../types';
import { hasCapability } from '../../core/auth/permissions';
import { AssigneePicker } from './AssigneePicker';
import { TaskDiscussionTab } from './TaskDiscussionTab';
import { TaskActivityTab } from './TaskActivityTab';
import { FilePanel } from '../common/FilePanel';

interface TaskEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
  projects: Project[];
  users: any[];
  onSubmit: (taskId: string, updates: Partial<Task>) => Promise<void>;
  notify: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  currentUserProfile?: any;
}

export function TaskEditModal({
  isOpen,
  onClose,
  task,
  projects,
  users,
  onSubmit,
  notify,
  currentUserProfile
}: TaskEditModalProps) {
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description || '');
  const [projectId, setProjectId] = useState(task.project_id || '');
  const [estimatedHours, setEstimatedHours] = useState(task.estimated_hours || 5);
  const [assigneeId, setAssigneeId] = useState(task.assignee_id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'discussion' | 'activity' | 'files'>('details');

  useEffect(() => {
    if (isOpen) {
      setName(task.name);
      setDescription(task.description || '');
      setProjectId(task.project_id || '');
      setEstimatedHours(task.estimated_hours || 5);
      setAssigneeId(task.assignee_id || '');
    }
  }, [isOpen, task]);

  if (!isOpen) return null;

  const isDeveloper = !hasCapability(currentUserProfile?.role, 'manage_projects');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !projectId) {
      notify("Workspace error: Title and targeted Project are mandatory.", "error");
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(task.id, {
        project_id: projectId,
        name,
        description,
        estimated_hours: Number(estimatedHours),
        assignee_id: assigneeId || undefined,
      });
      
      notify(`Task "${name}" updated successfully.`, "success");
      onClose();
    } catch (err: any) {
      notify(`Failed to update task: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-bg backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-bg border border-border p-6 rounded-sm w-full max-w-md relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent-primary to-accent-secondary" />
        
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs font-sans tracking-tight uppercase tracking-wide text-text-primary flex items-center gap-1.5">
            <Terminal className="w-4 h-4 text-signal-info" />
            Edit Task
          </h3>
          <button
            onClick={onClose}
            className="text-text-quaternary hover:text-text-primary cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-4 border-b border-border-subtle mb-4">
          <button
            onClick={() => setActiveTab('details')}
            className={`pb-2 text-[10px] font-mono tracking-wide uppercase transition-colors ${activeTab === 'details' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-text-quaternary hover:text-text-secondary'}`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('discussion')}
            className={`pb-2 text-[10px] font-mono tracking-wide uppercase transition-colors ${activeTab === 'discussion' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-text-quaternary hover:text-text-secondary'}`}
          >
            Discussion
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`pb-2 text-[10px] font-mono tracking-wide uppercase transition-colors ${activeTab === 'activity' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-text-quaternary hover:text-text-secondary'}`}
          >
            Activity
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`pb-2 text-[10px] font-mono tracking-wide uppercase transition-colors ${activeTab === 'files' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-text-quaternary hover:text-text-secondary'}`}
          >
            Files
          </button>
        </div>

        {activeTab === 'details' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
            <label className="block text-[8px] font-mono uppercase tracking-wider text-text-quaternary mb-1">Task Title *</label>
            <input
              type="text"
              required
              disabled={isDeveloper}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Implement Authentication"
              className={`w-full bg-bg border border-border p-2 text-xs font-mono text-text-primary placeholder-white/20 focus:border-border focus:outline-none transition-colors ${isDeveloper ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>

          <div>
            <label className="block text-[8px] font-mono uppercase tracking-wider text-text-quaternary mb-1">Target Project *</label>
            <select
              required
              disabled={isDeveloper}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={`w-full bg-bg border border-border p-2 text-xs font-mono text-text-primary focus:border-border focus:outline-none transition-colors ${isDeveloper ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <option value="">-- SELECT PROJECT --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[8px] font-mono uppercase tracking-wider text-text-quaternary mb-1">Description</label>
            <textarea
              value={description}
              disabled={isDeveloper}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Technical specs, links, etc."
              rows={3}
              className={`w-full bg-bg border border-border p-2 text-xs font-mono text-text-primary placeholder-white/20 focus:border-border focus:outline-none transition-colors resize-none ${isDeveloper ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-[8px] font-mono uppercase tracking-wider text-text-quaternary mb-1">Weight (Hours)</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(Number(e.target.value))}
                className="w-full bg-bg border border-border p-2 text-xs font-mono text-text-primary focus:border-border focus:outline-none transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[8px] font-mono uppercase tracking-wider text-text-quaternary mb-1">Assignee</label>
              <AssigneePicker
                users={users}
                value={assigneeId}
                onChange={setAssigneeId}
                disabled={isDeveloper}
                contextText={`${name} ${description}`}
              />
            </div>
          </div>

          <div className="pt-4 border-t border-border-subtle flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[9px] font-medium uppercase tracking-wide text-text-tertiary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-accent-primary hover:bg-accent-primary/90 text-[var(--pm-text)] dark:text-white text-[9px] font-medium uppercase tracking-wide transition-colors shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Processing...' : 'Save Changes'}
            </button>
          </div>
        </form>
        )}

        {activeTab === 'discussion' && (
          <TaskDiscussionTab 
            taskId={task.id} 
            users={users} 
            currentUserProfile={currentUserProfile} 
            notify={notify} 
          />
        )}

        {activeTab === 'activity' && (
          <TaskActivityTab taskId={task.id} />
        )}

        {activeTab === 'files' && (
          <div className="h-[400px] overflow-y-auto">
            <FilePanel 
              entityType="task" 
              entityId={task.id} 
              currentUserId={currentUserProfile?.id} 
              canEdit={!isDeveloper} 
            />
          </div>
        )}
      </motion.div>
    </div>
  );
}

