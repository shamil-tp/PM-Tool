import React from 'react';
import { TeamRosterView } from '../../components/resources/TeamRosterView';
import { SkillsMatrixView } from '../../components/resources/SkillsMatrixView';

export default function TeamsPage() {
  return (
    <div className="space-y-8 pb-16 font-geist text-[var(--pm-primary)]" style={{ color: 'var(--pm-on-surface)' }}>
      {/* Header */}
      <div className="flex items-end justify-between px-1 pt-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--pm-on-surface)' }}>
            Resource Orchestration
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--pm-on-surface-variant)' }}>
            Resource allocation and team composition.
          </p>
        </div>
        <div className="flex items-center gap-3 px-4 py-1.5 rounded-full border border-border bg-surface-2"
          style={{ background: 'var(--pm-surface-highest)', borderColor: 'rgba(70,69,84,0.3)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 operational-pulse" style={{ boxShadow: '0 0 8px rgba(251,191,36,0.5)' }} />
          <span className="font-mono-pm text-xs uppercase tracking-widest text-[var(--pm-on-surface-variant)]" style={{ color: 'var(--pm-on-surface-variant)' }}>
             RESOURCE POOL
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-12 glass-panel rounded-xl border border-border overflow-hidden bg-surface-2">
          <TeamRosterView />
        </div>
      </div>

      {/* Skills Matrix Section */}
      <div className="grid grid-cols-1 gap-6 mt-8">
        <div className="glass-panel rounded-xl border border-border overflow-hidden bg-surface-2">
          <SkillsMatrixView />
        </div>
      </div>
    </div>
  );
}
