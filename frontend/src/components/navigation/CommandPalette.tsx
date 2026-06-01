import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { Search, Folder, CheckSquare, Flag, FileText, User, X, ChevronRight, Zap } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { OperationalDataContext } from '../../context/OperationalDataContext';

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { workspace } = useWorkspace() || { workspace: null };
  const operationalData = useContext(OperationalDataContext);
  const projects = operationalData?.raw?.projects || [];
  const tasks = operationalData?.raw?.tasks || [];
  const profiles = operationalData?.raw?.profiles || [];
  const skills = operationalData?.raw?.skills || [];
  const userSkills = operationalData?.raw?.userSkills || [];
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setIsOpen(false);
    setQuery('');
  };

  const filteredProjects = projects.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 3);
  const filteredTasks = tasks.filter(t => t.name.toLowerCase().includes(query.toLowerCase())).slice(0, 3);
  
  // Skill Search
  const matchingSkills = skills.filter(s => s.name.toLowerCase().includes(query.toLowerCase()));
  let skilledProfiles: any[] = [];
  if (matchingSkills.length > 0 && query.trim().length > 0) {
    const matchedUserIds = userSkills
      .filter(us => matchingSkills.some(s => s.id === us.skill_id))
      .map(us => us.user_id);
    const uniqueUserIds = Array.from(new Set(matchedUserIds));
    skilledProfiles = profiles.filter(p => uniqueUserIds.includes(p.id)).slice(0, 5);
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--pm-surface)] dark:bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh]">
      <div className="bg-[var(--pm-panel)] border border-border w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <Search className="w-5 h-5 text-text-quaternary" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search projects, tasks, milestones, or type a command..."
            className="flex-1 bg-transparent border-none outline-none text-text-primary text-sm font-medium"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button onClick={handleClose} className="p-1 hover:bg-[var(--pm-panel)] rounded-md transition-colors text-text-tertiary">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin">
          {!query && (
            <div className="p-2">
              <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest px-2 mb-2">Quick Actions</div>
              <div className="space-y-1">
                {[
                  { icon: <Folder />, label: 'Create Project', color: 'text-indigo-400' },
                  { icon: <CheckSquare />, label: 'Create Task', color: 'text-emerald-400' },
                  { icon: <Flag />, label: 'Create Milestone', color: 'text-amber-400' },
                  { icon: <FileText />, label: 'Generate Report', color: 'text-rose-400' },
                  { icon: <Zap />, label: 'Open Executive Dashboard', color: 'text-accent-primary' }
                ].map((action, i) => (
                  <button key={i} className="w-full flex items-center justify-between p-2 hover:bg-[var(--pm-panel)] rounded-lg text-left group transition-all">
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-md bg-[var(--pm-panel)]-3 border border-border ${action.color}`}>
                        {React.cloneElement(action.icon as React.ReactElement<any>, { className: 'w-4 h-4' })}
                      </div>
                      <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary">{action.label}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-quaternary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {query && (
            <>
              {filteredProjects.length > 0 && (
                <div className="p-2">
                  <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest px-2 mb-2">Projects</div>
                  {filteredProjects.map(p => (
                    <button key={p.id} className="w-full flex items-center justify-between p-2 hover:bg-[var(--pm-panel)] rounded-lg text-left group transition-all">
                      <div className="flex items-center gap-3">
                        <Folder className="w-4 h-4 text-indigo-400" />
                        <span className="text-sm text-text-secondary group-hover:text-text-primary">{p.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {filteredTasks.length > 0 && (
                <div className="p-2">
                  <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest px-2 mb-2">Tasks</div>
                  {filteredTasks.map(t => (
                    <button key={t.id} className="w-full flex items-center justify-between p-2 hover:bg-[var(--pm-panel)] rounded-lg text-left group transition-all">
                      <div className="flex items-center gap-3">
                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm text-text-secondary group-hover:text-text-primary">{t.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {skilledProfiles.length > 0 && (
                <div className="p-2">
                  <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest px-2 mb-2">People by Skill</div>
                  {skilledProfiles.map(p => (
                    <button key={p.id} className="w-full flex items-center justify-between p-2 hover:bg-[var(--pm-panel)] rounded-lg text-left group transition-all">
                      <div className="flex items-center gap-3">
                        <User className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm text-text-secondary group-hover:text-text-primary">{p.full_name || p.email}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {filteredProjects.length === 0 && filteredTasks.length === 0 && skilledProfiles.length === 0 && (
                <div className="p-8 text-center text-text-tertiary text-sm font-mono">
                  No results found for "{query}"
                </div>
              )}
            </>
          )}
        </div>
        <div className="border-t border-border bg-[var(--pm-panel)] px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-text-quaternary">Navigate</span>
            <kbd className="px-1.5 py-0.5 bg-[var(--pm-panel)] border border-border rounded text-[9px] font-mono text-text-tertiary">↑</kbd>
            <kbd className="px-1.5 py-0.5 bg-[var(--pm-panel)] border border-border rounded text-[9px] font-mono text-text-tertiary">↓</kbd>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-text-quaternary">Close</span>
            <kbd className="px-1.5 py-0.5 bg-[var(--pm-panel)] border border-border rounded text-[9px] font-mono text-text-tertiary">ESC</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
