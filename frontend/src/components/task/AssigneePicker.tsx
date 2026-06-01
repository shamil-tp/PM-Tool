import React, { useState, useRef, useEffect } from 'react';
import { User, ChevronDown, Check } from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role?: string;
}

interface AssigneePickerProps {
  users: UserProfile[];
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
  contextText?: string;
}

import { useOperationalData } from '../../context/OperationalDataContext';

export function AssigneePicker({ users, value, onChange, disabled, contextText = '' }: AssigneePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { raw: { skills = [], userSkills = [] } } = useOperationalData();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedUser = (() => {
    return users.find(u => u.id === value);
  })();

  // Skill matching
  const relevantSkills = skills.filter(s => 
    contextText.toLowerCase().includes(s.name.toLowerCase())
  );
  
  const userSkillMatchMap = new Map<string, string[]>(); // userId -> matching skill names
  
  if (relevantSkills.length > 0) {
    users.forEach(user => {
      const userSkillRows = userSkills.filter(us => us.user_id === user.id);
      const matches = userSkillRows
        .filter(us => relevantSkills.some(rs => rs.id === us.skill_id))
        .map(us => skills.find(s => s.id === us.skill_id)?.name || '');
      if (matches.length > 0) {
        userSkillMatchMap.set(user.id, matches);
      }
    });
  }

  // Sort users so that matched users appear first
  const sortedUsers = [...users].sort((a, b) => {
    const aMatch = userSkillMatchMap.has(a.id) ? 1 : 0;
    const bMatch = userSkillMatchMap.has(b.id) ? 1 : 0;
    return bMatch - aMatch;
  });

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-surface-2 border border-border/50 p-2.5 flex items-center justify-between text-sm font-medium text-text-primary outline-none transition-all rounded-lg shadow-inner ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-3 cursor-pointer focus:border-accent-primary/70'}`}
      >
        <div className="flex items-center gap-2 truncate">
          {selectedUser ? (
            <>
              {selectedUser.avatar_url ? (
                <img src={selectedUser.avatar_url} alt="" className="w-5 h-5 rounded-full border border-border shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-surface-3 border border-border flex items-center justify-center shrink-0">
                  <User className="w-3 h-3 text-text-tertiary" />
                </div>
              )}
              <span className="truncate">
                {selectedUser.full_name || selectedUser.email.split('@')[0]}
              </span>
            </>
          ) : (
            <div className="flex items-center gap-2 text-text-quaternary">
              <div className="w-5 h-5 border border-dashed border-border rounded-full flex items-center justify-center">
                <User className="w-3 h-3" />
              </div>
              Unassigned
            </div>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-text-tertiary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-surface-3 border border-border/50 rounded-lg shadow-xl max-h-[240px] overflow-y-auto py-1 animate-in fade-in slide-in-from-top-2">
          <button
            type="button"
            onClick={() => { onChange(''); setIsOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-surface-4 ${!value ? 'bg-surface-4' : ''}`}
          >
            <div className="flex items-center gap-2 text-text-secondary">
              <div className="w-5 h-5 border border-dashed border-border rounded-full flex items-center justify-center shrink-0">
                <User className="w-3 h-3 text-text-quaternary" />
              </div>
              Unassigned
            </div>
            {!value && <Check className="w-4 h-4 text-accent-primary" />}
          </button>

          {sortedUsers.map(user => {
            const isSelected = value === user.id;
            const matches = userSkillMatchMap.get(user.id);
            return (
              <button
                key={user.id}
                type="button"
                onClick={() => { onChange(user.id); setIsOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-surface-4 ${isSelected ? 'bg-surface-4' : ''}`}
              >
                <div className="flex items-center gap-2 truncate">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-5 h-5 rounded-full border border-border shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
                      <User className="w-3 h-3 text-text-tertiary" />
                    </div>
                  )}
                  <div className="flex flex-col items-start truncate">
                    <span className={`truncate ${isSelected ? 'text-accent-primary font-semibold' : 'text-text-primary'}`}>
                      {user.full_name || user.email.split('@')[0]}
                    </span>
                    {matches && matches.length > 0 ? (
                      <span className="text-[10px] text-emerald-400 truncate bg-emerald-400/10 px-1 rounded">
                        Skilled in: {matches.join(', ')}
                      </span>
                    ) : (
                      user.full_name && (
                        <span className="text-[10px] text-text-quaternary truncate">{user.email}</span>
                      )
                    )}
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-accent-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
