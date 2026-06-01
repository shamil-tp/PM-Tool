import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TaskComment, fetchTaskComments, createTaskComment, archiveTaskComment, updateTaskComment } from '../../services/taskCommentService';
import { useWorkspace } from '../../context/WorkspaceContext';
import { MessageSquare, Trash, Edit2, Send, X } from 'lucide-react';

interface TaskDiscussionTabProps {
  taskId: string;
  users: any[];
  currentUserProfile: any;
  notify: (msg: string, type: 'success' | 'error') => void;
}

export function TaskDiscussionTab({ taskId, users, currentUserProfile, notify }: TaskDiscussionTabProps) {
  const { workspace } = useWorkspace() as any;
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    loadComments();
  }, [taskId]);

  const loadComments = async () => {
    const data = await fetchTaskComments(taskId);
    setComments(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !workspace?.id || !currentUserProfile?.id) return;

    try {
      setIsSubmitting(true);
      const comment = await createTaskComment(
        workspace.id,
        taskId,
        currentUserProfile.id,
        newComment.trim(),
        users
      );
      if (comment) {
        setComments([...comments, comment]);
        setNewComment('');
      } else {
        notify('Failed to post comment', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (commentId: string) => {
    if (!editContent.trim() || !workspace?.id || !currentUserProfile?.id) return;
    setIsSubmitting(true);
    try {
      const success = await updateTaskComment(commentId, editContent.trim(), workspace.id, currentUserProfile.id, taskId);
      if (success) {
        setComments(comments.map(c => c.id === commentId ? { ...c, content: editContent.trim() } : c));
        setEditingId(null);
      } else {
        notify('Failed to update comment', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string, authorId: string) => {
    const canModerate = ['super_admin', 'pm'].includes(currentUserProfile?.role);
    const isOwner = currentUserProfile?.id === authorId;
    
    if (!canModerate && !isOwner) {
      notify('You can only delete your own comments.', 'error');
      return;
    }

    if (!workspace?.id || !currentUserProfile?.id) return;
    
    const success = await archiveTaskComment(commentId, workspace.id, currentUserProfile.id, taskId);
    if (success) {
      setComments(comments.filter(c => c.id !== commentId));
    } else {
      notify('Failed to delete comment', 'error');
    }
  };

  return (
    <div className="flex flex-col h-[400px]">
      <div className="flex-1 overflow-y-auto space-y-4 p-2 mb-4">
        {comments.length === 0 ? (
          <div className="text-[10px] text-text-quaternary font-mono text-center mt-10">No discussion yet.</div>
        ) : (
          comments.map(c => (
            <div key={c.id} className="bg-bg border border-border-subtle p-3 rounded flex gap-3">
              <div className="w-6 h-6 rounded bg-surface overflow-hidden shrink-0">
                {c.author?.avatar_url ? (
                  <img src={c.author.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-text-tertiary font-mono">
                    {(c.author?.full_name || c.author?.email || '?').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[10px] font-mono text-text-secondary">
                    {c.author?.full_name || c.author?.email || 'Former Member'}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-text-quaternary">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                    {currentUserProfile?.id === c.author_id && (
                      <button onClick={() => { setEditingId(c.id); setEditContent(c.content); }} className="text-text-quaternary hover:text-accent-primary transition-colors">
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                    {(currentUserProfile?.id === c.author_id || ['super_admin', 'pm'].includes(currentUserProfile?.role)) && (
                      <button onClick={() => handleDelete(c.id, c.author_id)} className="text-text-quaternary hover:text-signal-error transition-colors">
                        <Trash className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                {editingId === c.id ? (
                  <div className="mt-2">
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      className="w-full bg-bg border border-border p-2 text-xs font-mono text-text-primary focus:border-accent-primary focus:outline-none transition-colors resize-none h-[60px]"
                    />
                    <div className="flex gap-2 mt-2 justify-end">
                      <button onClick={() => setEditingId(null)} className="text-[9px] uppercase tracking-wide text-text-quaternary hover:text-text-secondary">Cancel</button>
                      <button onClick={() => handleUpdate(c.id)} disabled={isSubmitting} className="text-[9px] uppercase tracking-wide bg-accent-primary text-[var(--pm-text)] dark:text-white px-2 py-1 rounded">Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-text-primary whitespace-pre-wrap">
                    {c.content}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      
      <form onSubmit={handleSubmit} className="flex gap-2 items-end pt-2 border-t border-border-subtle">
        <textarea
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder="Add a comment... Type @ to mention someone"
          className="flex-1 bg-bg border border-border p-2 text-xs font-mono text-text-primary placeholder-white/20 focus:border-border focus:outline-none transition-colors resize-none h-[60px]"
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <button
          type="submit"
          disabled={isSubmitting || !newComment.trim()}
          className="h-[60px] px-4 bg-accent-primary hover:bg-accent-primary/90 text-[var(--pm-text)] dark:text-white flex items-center justify-center disabled:opacity-50 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
