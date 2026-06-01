import React, { useMemo, useState } from 'react';
import { useOperationalData } from '../../context/OperationalDataContext';
import { useAuth } from '../../context/AuthContext';
import { hasCapability } from '../../core/auth/permissions';
import { Settings } from 'lucide-react';
import { ManageSkillsModal } from './ManageSkillsModal';

export function SkillsMatrixView() {
  const { raw: { skills = [], userSkills = [], profiles = [] } } = useOperationalData();
  const { profile } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const canManageTeam = hasCapability(profile?.role, 'manage_teams');

  // Compute coverage: which skills exist, and how many people have them?
  const skillCoverage = useMemo(() => {
    return skills.map(skill => {
      const usersWithSkill = userSkills.filter(us => us.skill_id === skill.id);
      return {
        ...skill,
        userCount: usersWithSkill.length
      };
    }).sort((a, b) => b.userCount - a.userCount);
  }, [skills, userSkills]);

  const missingSkills = skillCoverage.filter(sc => sc.userCount === 0);
  const coveredSkills = skillCoverage.filter(sc => sc.userCount > 0);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-6">
        <h2 className="text-lg font-semibold text-[var(--pm-on-surface)]">Team Skills Matrix</h2>
        {canManageTeam && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-border rounded text-sm font-medium text-text-secondary hover:text-text-primary hover:border-accent-primary transition-colors"
          >
            <Settings className="w-4 h-4" />
            Manage Skills
          </button>
        )}
      </div>

      {isModalOpen && <ManageSkillsModal onClose={() => setIsModalOpen(false)} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Coverage Overview */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-text-tertiary">Skill Coverage</h3>
          <div className="bg-surface-highest rounded-lg p-4 border border-border space-y-3">
            {coveredSkills.length === 0 ? (
              <div className="text-sm text-text-tertiary italic">No skills recorded yet.</div>
            ) : (
              coveredSkills.map(sc => (
                <div key={sc.id} className="flex justify-between items-center text-sm">
                  <span className="font-medium">{sc.name}</span>
                  <span className="text-xs bg-emerald-400/10 text-emerald-400 px-2 py-0.5 rounded-full font-mono">
                    {sc.userCount} {sc.userCount === 1 ? 'Person' : 'People'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Missing Skills */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-text-tertiary">Missing Skills</h3>
          <div className="bg-surface-highest rounded-lg p-4 border border-border space-y-3">
            {missingSkills.length === 0 ? (
              <div className="text-sm text-text-tertiary italic">No missing skills detected.</div>
            ) : (
              missingSkills.map(sc => (
                <div key={sc.id} className="flex justify-between items-center text-sm">
                  <span className="font-medium text-text-secondary">{sc.name}</span>
                  <span className="text-xs bg-rose-400/10 text-rose-400 px-2 py-0.5 rounded-full font-mono">
                    0 People
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Team Capability Overview */}
      <div className="mt-8 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-text-tertiary">Team Capability Overview</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm bg-surface-highest">
            <thead className="bg-surface-3 border-b border-border">
              <tr>
                <th className="px-4 py-3 font-medium text-text-secondary">Team Member</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Top Skills</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Skill Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {profiles.filter(p => p.role !== 'uninvited').map(p => {
                const memberSkills = userSkills.filter(us => us.user_id === p.id);
                const topSkills = memberSkills.map(us => skills.find(s => s.id === us.skill_id)?.name).filter(Boolean);
                
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-medium text-text-primary">{p.full_name || p.email}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {topSkills.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {topSkills.slice(0, 3).map((name, i) => (
                            <span key={i} className="bg-surface-2 border border-border px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">
                              {name}
                            </span>
                          ))}
                          {topSkills.length > 3 && <span className="text-[10px] text-text-tertiary">+{topSkills.length - 3}</span>}
                        </div>
                      ) : (
                        <span className="text-text-tertiary italic text-xs">No skills listed</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary font-mono">{memberSkills.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
