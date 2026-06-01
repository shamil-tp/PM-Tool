import React, { useState, useEffect, useRef } from 'react';
import { Send, MoreHorizontal, Trash2, Edit2, MessageSquare, Paperclip } from 'lucide-react';
import { collaborationService, UniversalComment, Mention } from '../../services/collaborationService';
import { FilePanel } from './FilePanel';
import { MentionSelector } from './MentionSelector';
import { Profile } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { realtimeOrchestrator } from '../../services/realtimeOrchestrator';

interface CommentThreadProps {
  entityType: string;
  entityId: string;
  profiles: Profile[];
  currentUserId: string;
  routePath?: string;
}

export function CommentThread({ entityType, entityId, profiles, currentUserId, routePath }: CommentThreadProps) {
  const { workspace } = useWorkspace() as any;
  const [comments, setComments] = useState<UniversalComment[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // File Panel State
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

  // Mention State
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionPosition, setMentionPosition] = useState<{ top: number; left: number } | null>(null);
  const [activeMentions, setActiveMentions] = useState<Mention[]>([]);

  useEffect(() => {
    if (workspace?.id) {
      loadComments();

      // Set up realtime subscription
      const unsubscribe = realtimeOrchestrator.subscribe(
        `comments-${entityType}-${entityId}`,
        'universal_comments',
        `workspace_id=eq.${workspace.id}`,
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newComment = payload.new as UniversalComment;
            if (newComment.entity_type === entityType && newComment.entity_id === entityId) {
              setComments(prev => {
                if (prev.find(c => c.id === newComment.id)) return prev;
                // Ideally we'd fetch the author profile too, but we can refetch or just append
                loadComments();
                return prev;
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            loadComments();
          } else if (payload.eventType === 'DELETE') {
            setComments(prev => prev.filter(c => c.id !== payload.old.id));
          }
        }
      );

      return () => unsubscribe();
    }
  }, [workspace?.id, entityType, entityId]);

  const loadComments = async () => {
    setFetchError(null);
    const { data, error } = await collaborationService.fetchComments(workspace.id, entityType, entityId);
    
    if (error) {
      if (error?.code === 'PGRST116' || error?.code === '42501' || error?.message?.includes('RLS') || error?.message?.includes('permission')) {
        setFetchError("You no longer have access to this item");
      } else {
        setFetchError("Failed to load comments");
      }
      setComments([]);
      return;
    }
    
    setComments(data);
    
    // Auto-scroll to specific comment if present in URL
    setTimeout(() => {
      try {
        // Parse from hash if using hash routing, or from search
        const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || window.location.search);
        const targetComment = urlParams.get('comment');
        if (targetComment) {
          const el = document.getElementById(`comment-${targetComment}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('bg-accent-primary/20', 'transition-colors', 'duration-1000');
            setTimeout(() => el.classList.remove('bg-accent-primary/20'), 2000);
          }
        }
      } catch (e) {}
    }, 100);
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Naive mention detection logic
    const cursor = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursor);
    const match = textBeforeCursor.match(/@(\w*)$/);

    if (match) {
      setMentionQuery(match[1]);
      // Approximate cursor position (in a real app, use getCaretCoordinates)
      const rect = e.target.getBoundingClientRect();
      setMentionPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX + Math.min(match.index! * 8, rect.width - 200)
      });
    } else {
      setMentionQuery(null);
      setMentionPosition(null);
    }
  };

  const insertMention = (profile: Profile) => {
    if (mentionQuery === null) return;
    
    const cursor = inputRef.current?.selectionStart || 0;
    const textBeforeMention = inputValue.substring(0, cursor - mentionQuery.length - 1);
    const textAfterMention = inputValue.substring(cursor);
    
    const newText = `${textBeforeMention}@${profile.full_name} ${textAfterMention}`;
    setInputValue(newText);
    
    // Add to active mentions array
    if (!activeMentions.find(m => m.id === profile.id)) {
      setActiveMentions([...activeMentions, { id: profile.id, name: profile.full_name || 'User' }]);
    }

    setMentionQuery(null);
    setMentionPosition(null);
    inputRef.current?.focus();
  };

  const handleSubmit = async () => {
    if (!inputValue.trim() || !workspace?.id) return;
    setIsSubmitting(true);
    
    const newComment = await collaborationService.addComment(
      workspace.id,
      entityType,
      entityId,
      currentUserId,
      inputValue,
      activeMentions,
      routePath
    );

    if (newComment) {
      setComments([...comments, newComment]);
      setInputValue('');
      setActiveMentions([]);
    }
    
    setIsSubmitting(false);
  };

  const handleDelete = async (commentId: string) => {
    const success = await collaborationService.deleteComment(commentId);
    if (success) {
      setComments(comments.filter(c => c.id !== commentId));
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--pm-surface)] rounded-xl border border-[var(--pm-border)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--pm-border)] bg-surface-2 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-text-secondary" />
        <h3 className="text-sm font-semibold text-text-primary">Discussion</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {fetchError ? (
          <div className="h-full flex flex-col items-center justify-center text-xs text-signal-critical italic gap-2">
            <span className="font-semibold">{fetchError}</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-text-tertiary italic">
            No comments yet. Start the conversation.
          </div>
        ) : (
          comments.map(comment => (
            <div key={comment.id} id={`comment-${comment.id}`} className="flex gap-3 group rounded-md p-1 -mx-1">
              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-[var(--pm-border)] bg-surface-2">
                {comment.author?.avatar_url ? (
                  <img src={comment.author.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-text-tertiary">
                    {comment.author?.full_name?.charAt(0) || '?'}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-text-primary">{comment.author?.full_name || 'Former Member'}</span>
                    <span className="text-[10px] text-text-quaternary">{new Date(comment.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                      onClick={() => setExpandedFiles(prev => ({ ...prev, [comment.id]: !prev[comment.id] }))}
                      className="p-1 text-text-quaternary hover:text-accent-primary transition-all"
                      title="Attach or View Files"
                    >
                      <Paperclip className="w-3 h-3" />
                    </button>
                    {comment.author_id === currentUserId && (
                      <button 
                        onClick={() => handleDelete(comment.id)}
                        className="p-1 text-text-quaternary hover:text-signal-critical transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-sm text-text-secondary mt-0.5 whitespace-pre-wrap">
                  {/* Highlight mentions safely */}
                  {comment.body.split(/(@[\w\s]+)/g).map((part, i) => {
                    const mentionMatch = comment.mentions?.find(m => `@${m.name}` === part);
                    if (mentionMatch) {
                      return <span key={i} className="text-accent-primary font-medium bg-accent-primary/10 px-1 rounded-sm">{part}</span>;
                    }
                    return part;
                  })}
                </div>
                {expandedFiles[comment.id] && (
                  <div className="mt-3 p-3 bg-bg border border-[var(--pm-border)] rounded-md">
                    <FilePanel 
                      entityType="comment"
                      entityId={comment.id}
                      currentUserId={currentUserId}
                      canEdit={comment.author_id === currentUserId}
                    />
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-3 bg-surface-2 border-t border-[var(--pm-border)] relative">
        <div className={`relative flex items-end gap-2 bg-[var(--pm-surface)] rounded-lg border border-[var(--pm-border)] p-1 transition-colors ${fetchError ? 'opacity-50 pointer-events-none' : 'focus-within:border-accent-primary/50'}`}>
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleInput}
            placeholder="Type your comment... use @ to mention"
            className="flex-1 max-h-32 min-h-[40px] bg-transparent resize-none outline-none text-sm px-2 py-2 text-text-primary placeholder:text-text-quaternary"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && mentionQuery === null) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!inputValue.trim() || isSubmitting}
            className="p-2 mb-1 mr-1 bg-accent-primary hover:bg-accent-primary/90 text-white rounded-md disabled:opacity-50 transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {mentionQuery !== null && (
          <MentionSelector
            query={mentionQuery}
            profiles={profiles}
            onSelect={insertMention}
            position={mentionPosition}
          />
        )}
      </div>
    </div>
  );
}
