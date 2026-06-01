import React, { useState } from 'react';
import { X, Plus, Trash2, Shield, Search } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useOperationalData } from '../../context/OperationalDataContext';
import { createSkill, deleteSkill, upsertUserSkill, removeUserSkill } from '../../services/operationalDataService';
import { useAuth } from '../../context/AuthContext';

interface ManageSkillsModalProps {
  onClose: () => void;
}

export function ManageSkillsModal({ onClose }: ManageSkillsModalProps) {
  const { workspace } = useWorkspace();
  const { profile } = useAuth();
  const { raw: { skills = [], userSkills = [], profiles = [] }, refreshAll } = useOperationalData();
  const [activeTab, setActiveTab] = useState<'dictionary' | 'allocation'>('dictionary');
  
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('');
  
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('intermediate');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateSkill = async () => {
    if (!workspace || !newSkillName) return;
    setIsSubmitting(true);
    try {
      await createSkill(workspace.id, newSkillName, newSkillCategory || 'General');
      setNewSkillName('');
      setNewSkillCategory('');
      await refreshAll();
    } catch (e: any) {
      alert(e.message || "Failed to create skill");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    if (!confirm('Are you sure? This will remove it from all users.')) return;
    try {
      await deleteSkill(skillId);
      await refreshAll();
    } catch (e: any) {
      alert("Failed to delete skill");
    }
  };

  const handleAssignSkill = async () => {
    if (!selectedUser || !selectedSkill || !selectedLevel) return;
    setIsSubmitting(true);
    try {
      await upsertUserSkill(selectedUser, selectedSkill, selectedLevel, profile?.id);
      await refreshAll();
      setSelectedSkill('');
    } catch (e: any) {
      alert("Failed to assign skill");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveUserSkill = async (userId: string, skillId: string) => {
    try {
      await removeUserSkill(userId, skillId);
      await refreshAll();
    } catch (e: any) {
      alert("Failed to remove skill");
    }
  };

  const activeTeamMembers = profiles.filter(p => p.role !== 'uninvited');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface-2 w-full max-w-2xl rounded-xl border border-border shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-accent-primary" />
            <h2 className="text-xl font-semibold text-[var(--pm-on-surface)]">Manage Team Skills</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-highest rounded-full transition-colors text-text-tertiary hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex border-b border-border/50 px-6">
          <button 
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'dictionary' ? 'border-accent-primary text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-secondary'}`}
            onClick={() => setActiveTab('dictionary')}
          >
            Skill Dictionary
          </button>
          <button 
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'allocation' ? 'border-accent-primary text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-secondary'}`}
            onClick={() => setActiveTab('allocation')}
          >
            Team Allocation
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {activeTab === 'dictionary' && (
            <div className="space-y-6">
              <div className="bg-surface-highest p-4 rounded-lg border border-border space-y-3">
                <h3 className="text-sm font-semibold text-text-primary">Add New Skill</h3>
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    placeholder="Skill Name (e.g. React, Python)" 
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    className="flex-1 bg-surface-2 border border-border p-2 rounded text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                  />
                  <input 
                    type="text" 
                    placeholder="Category (e.g. Frontend)" 
                    value={newSkillCategory}
                    onChange={(e) => setNewSkillCategory(e.target.value)}
                    className="flex-1 bg-surface-2 border border-border p-2 rounded text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                  />
                  <button 
                    onClick={handleCreateSkill}
                    disabled={!newSkillName || isSubmitting}
                    className="px-4 py-2 bg-accent-primary text-black font-semibold rounded hover:bg-emerald-400 disabled:opacity-50 text-sm flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-widest text-text-tertiary mb-3">Workspace Skills</h3>
                {skills.length === 0 ? (
                  <p className="text-sm text-text-tertiary italic">No skills defined in this workspace.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {skills.map(skill => (
                      <div key={skill.id} className="flex justify-between items-center p-3 rounded-lg border border-border bg-surface-highest">
                        <div>
                          <div className="text-sm font-medium text-text-primary">{skill.name}</div>
                          <div className="text-xs text-text-tertiary">{skill.category || 'General'}</div>
                        </div>
                        <button onClick={() => handleDeleteSkill(skill.id)} className="text-rose-400 hover:text-rose-300 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'allocation' && (
            <div className="space-y-6">
              <div className="bg-surface-highest p-4 rounded-lg border border-border space-y-4">
                <h3 className="text-sm font-semibold text-text-primary">Assign Skill</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <select 
                    value={selectedUser} 
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className="bg-surface-2 border border-border p-2 rounded text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                  >
                    <option className="bg-surface-highest text-text-primary" value="">Select Member</option>
                    {activeTeamMembers.map(m => (
                      <option className="bg-surface-highest text-text-primary" key={m.id} value={m.id}>{m.full_name || m.email}</option>
                    ))}
                  </select>
                  
                  <select 
                    value={selectedSkill} 
                    onChange={(e) => setSelectedSkill(e.target.value)}
                    className="bg-surface-2 border border-border p-2 rounded text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                  >
                    <option className="bg-surface-highest text-text-primary" value="">Select Skill</option>
                    {skills.map(s => (
                      <option className="bg-surface-highest text-text-primary" key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>

                  <select 
                    value={selectedLevel} 
                    onChange={(e) => setSelectedLevel(e.target.value)}
                    className="bg-surface-2 border border-border p-2 rounded text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                  >
                    <option className="bg-surface-highest text-text-primary" value="beginner">Beginner</option>
                    <option className="bg-surface-highest text-text-primary" value="intermediate">Intermediate</option>
                    <option className="bg-surface-highest text-text-primary" value="advanced">Advanced</option>
                    <option className="bg-surface-highest text-text-primary" value="expert">Expert</option>
                  </select>
                </div>
                <div className="flex justify-end">
                  <button 
                    onClick={handleAssignSkill}
                    disabled={!selectedUser || !selectedSkill || isSubmitting}
                    className="px-4 py-2 bg-accent-primary text-black font-semibold rounded hover:bg-emerald-400 disabled:opacity-50 text-sm flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Assign
                  </button>
                </div>
              </div>

              {selectedUser && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-text-tertiary">Current Skills</h3>
                  {userSkills.filter(us => us.user_id === selectedUser).length === 0 ? (
                    <p className="text-sm text-text-tertiary italic">No skills assigned yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {userSkills.filter(us => us.user_id === selectedUser).map(us => {
                        const s = skills.find(sk => sk.id === us.skill_id);
                        if (!s) return null;
                        return (
                          <div key={us.id} className="flex justify-between items-center p-3 rounded-lg border border-border bg-surface-highest">
                            <div>
                              <div className="text-sm font-medium text-text-primary">{s.name}</div>
                              <div className="text-xs text-text-tertiary uppercase tracking-wider">{us.level}</div>
                            </div>
                            <button onClick={() => handleRemoveUserSkill(selectedUser, s.id)} className="text-rose-400 hover:text-rose-300 text-xs font-medium">
                              Remove
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
