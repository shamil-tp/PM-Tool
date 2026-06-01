import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Profile } from '../../types';

interface MentionSelectorProps {
  query: string;
  profiles: Profile[];
  onSelect: (profile: Profile) => void;
  position: { top: number; left: number } | null;
}

export function MentionSelector({ query, profiles, onSelect, position }: MentionSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredProfiles = profiles.filter(p => 
    p.full_name?.toLowerCase().includes(query.toLowerCase()) || 
    p.email?.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 5);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!position) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredProfiles.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredProfiles.length) % filteredProfiles.length);
      } else if (e.key === 'Enter' && filteredProfiles[selectedIndex]) {
        e.preventDefault();
        onSelect(filteredProfiles[selectedIndex]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [position, filteredProfiles, selectedIndex, onSelect]);

  if (!position || filteredProfiles.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 5 }}
        className="absolute z-50 bg-[var(--pm-surface)] border border-[var(--pm-border)] shadow-xl rounded-md overflow-hidden min-w-[200px]"
        style={{ top: position.top, left: position.left }}
      >
        <div className="text-[10px] uppercase font-bold text-text-quaternary px-3 py-1.5 border-b border-[var(--pm-border)]">
          People
        </div>
        <ul>
          {filteredProfiles.map((p, i) => (
            <li
              key={p.id}
              className={`px-3 py-2 text-sm flex items-center gap-2 cursor-pointer transition-colors ${
                i === selectedIndex ? 'bg-surface-3 text-text-primary' : 'text-text-secondary hover:bg-surface-2'
              }`}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => onSelect(p)}
            >
              <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-border">
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt={p.full_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-surface-2 flex items-center justify-center text-[9px] font-bold text-text-tertiary">
                    {p.full_name?.charAt(0) || '?'}
                  </div>
                )}
              </div>
              <div className="flex flex-col">
                <span className="font-medium text-xs leading-none">{p.full_name}</span>
                <span className="text-[10px] text-text-tertiary mt-0.5">{p.role}</span>
              </div>
            </li>
          ))}
        </ul>
      </motion.div>
    </AnimatePresence>
  );
}
