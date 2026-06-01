import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../context/DashboardContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useOperationalData } from '../../context/OperationalDataContext';
import { Icon } from '../ui/Icon';
import { supabase } from '../../lib/supabase';
import { DocumentGeneratorDropdown } from '../hr/DocumentGeneratorDropdown';
function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    super_admin: 'Super Admin',
    admin:       'Admin',
    manager:     'Project Manager',
    editor:      'Developer',
    viewer:      'Viewer'
  };
  return labels[role] || 'Member';
}

function getInitials(name: string) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export function MemberDirectory() {
  const { profile: currentUserProfile } = useAuth();
  const { profiles, invalidateAll, systemData } = useDashboard();
  const { raw: { skills = [], userSkills = [] } } = useOperationalData();
  const { workspace } = useWorkspace();
  const [selectedMemberDetails, setSelectedMemberDetails] = useState<any | null>(null);

  const userCustomRoles = systemData.userCustomRoles || {};
  const activeProfiles = profiles.filter(p => p.role !== 'uninvited');

  return (
    <div className="space-y-6">
      <div className="rounded-xl shadow-2xl" style={{ background: 'var(--pm-surface-low)', border: '1px solid rgba(70,69,84,0.3)' }}>
        <table className="w-full text-left border-collapse">
          <thead style={{ background: 'rgba(51,53,55,0.5)', borderBottom: '1px solid rgba(70,69,84,0.3)' }}>
            <tr>
              <th className="px-8 py-4 rounded-tl-xl text-[11px] font-mono uppercase tracking-widest text-text-tertiary">Member Directory</th>
              <th className="px-8 py-4 text-[11px] font-mono uppercase tracking-widest text-text-tertiary">Department</th>
              <th className="px-8 py-4 rounded-tr-xl text-[11px] font-mono uppercase tracking-widest text-text-tertiary text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'rgba(70,69,84,0.1)' }}>
            {activeProfiles.map((p: any) => {
              const initials = getInitials(p.full_name || p.email || '');
              return (
                <tr key={p.id} className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => setSelectedMemberDetails(p)}>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                        {initials}
                      </div>
                      <div>
                        <div className="font-medium hover:underline" style={{ color: 'var(--pm-on-surface)' }}>
                          {p.full_name || 'Unknown'}
                        </div>
                        <div className="font-mono text-[11px] mt-0.5 uppercase opacity-60 text-text-secondary">
                          {p.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-surface-3 text-text-secondary border border-border">
                      {userCustomRoles[p.id] || 'General'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button className="text-[11px] font-mono uppercase tracking-widest text-indigo-400 hover:text-indigo-300">
                      View Profile
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedMemberDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-xl shadow-2xl p-6 relative" style={{ background: 'var(--pm-surface)', border: '1px solid rgba(70,69,84,0.3)', color: 'var(--pm-on-surface)' }}>
            <button 
              onClick={() => setSelectedMemberDetails(null)}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: 'var(--pm-on-surface-variant)' }}
            >
              <Icon name="close" size={20} />
            </button>
            <h3 className="text-xl font-semibold mb-6">Member Details</h3>

            <div className="space-y-6">
              {/* Profile Information */}
              <div className="border border-white/10 rounded-lg p-4 bg-white/5">
                <h4 className="text-xs font-mono uppercase tracking-widest text-white/50 mb-4">Profile Information</h4>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
                    {getInitials(selectedMemberDetails.full_name || selectedMemberDetails.email || '')}
                  </div>
                  <div>
                    <div className="font-semibold text-lg">{selectedMemberDetails.full_name || 'Unknown User'}</div>
                    <div className="text-sm text-white/60 font-mono mt-1">{selectedMemberDetails.email}</div>
                  </div>
                </div>
              </div>

              {/* Employment Details */}
              <div className="border border-white/10 rounded-lg p-4 bg-white/5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-mono uppercase tracking-widest text-white/50">Employment Details</h4>
                  
                  <div className="flex gap-2">
                    {workspace?.id && (
                      <>
                        <DocumentGeneratorDropdown
                          workspaceId={workspace.id}
                          type="offer_letter"
                          companyName="Resolve PM"
                          buttonText="Offer Letter"
                          fileName={`Offer_Letter_${(selectedMemberDetails.full_name || 'User').replace(/\s+/g, '_')}`}
                          data={{
                            employee_name: selectedMemberDetails.full_name || 'User',
                            role: getRoleLabel(selectedMemberDetails.role),
                            salary: 'TBD',
                            joining_date: selectedMemberDetails.date_of_joining ? new Date(selectedMemberDetails.date_of_joining).toLocaleDateString() : 'TBD'
                          }}
                        />
                        <DocumentGeneratorDropdown
                          workspaceId={workspace.id}
                          type="experience_letter"
                          companyName="Resolve PM"
                          buttonText="Experience Letter"
                          fileName={`Experience_Letter_${(selectedMemberDetails.full_name || 'User').replace(/\s+/g, '_')}`}
                          data={{
                            employee_name: selectedMemberDetails.full_name || 'User',
                            role: getRoleLabel(selectedMemberDetails.role),
                            start_date: selectedMemberDetails.date_of_joining ? new Date(selectedMemberDetails.date_of_joining).toLocaleDateString() : 'TBD',
                            end_date: new Date().toLocaleDateString()
                          }}
                        />
                      </>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] uppercase text-white/50 font-mono mb-1">Role</div>
                    <div className="font-medium">{getRoleLabel(selectedMemberDetails.role)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-white/50 font-mono mb-1">Department</div>
                    <div className="font-medium">{userCustomRoles[selectedMemberDetails.id] || 'General'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-white/50 font-mono mb-1">Employment Status</div>
                    <div className="font-medium capitalize">{selectedMemberDetails.employment_status || 'Active'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-white/50 font-mono mb-1">Date of Joining</div>
                    {currentUserProfile?.role === 'super_admin' ? (
                      <input
                        type="date"
                        value={selectedMemberDetails.date_of_joining ? selectedMemberDetails.date_of_joining.split('T')[0] : ''}
                        onChange={async (e) => {
                          const newDoj = e.target.value;
                          if (!newDoj) return;
                          
                          const reason = window.prompt("Enter reason for changing the Date of Joining (Required for HR Audit):");
                          if (!reason || reason.trim() === '') {
                            alert("Reason is required to change employment records.");
                            return;
                          }

                          if (window.confirm(`Confirm action: Change DOJ for ${selectedMemberDetails.full_name || selectedMemberDetails.email}?`)) {
                            const { error } = await supabase.from('employment_records')
                              .update({ date_of_joining: new Date(newDoj).toISOString() })
                              .eq('profile_id', selectedMemberDetails.id);
                              
                            if (!error) {
                              await supabase.from('employment_change_logs').insert({
                                employee_id: selectedMemberDetails.id,
                                field_changed: 'date_of_joining',
                                previous_value: selectedMemberDetails.date_of_joining || '',
                                new_value: new Date(newDoj).toISOString(),
                                changed_by: currentUserProfile?.id,
                                reason: reason.trim()
                              });
                              alert("Date of Joining updated successfully.");
                              setSelectedMemberDetails({ ...selectedMemberDetails, date_of_joining: new Date(newDoj).toISOString() });
                              invalidateAll();
                            } else {
                              alert("Failed to update Date of Joining.");
                            }
                          }
                        }}
                        className="w-full border rounded text-xs font-mono px-2 py-1 outline-none mt-1"
                        style={{ borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
                        title="Edit Employment Details"
                      />
                    ) : (
                      <div className="font-medium mt-1">
                        {selectedMemberDetails.date_of_joining ? new Date(selectedMemberDetails.date_of_joining).toLocaleDateString() : 'N/A'}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-[var(--pm-border)]">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--pm-text-secondary)] mb-3">Professional Skills</h4>
                  <div className="space-y-2">
                    {(() => {
                      const memberSkills = userSkills.filter(us => us.user_id === selectedMemberDetails.id);
                      if (memberSkills.length === 0) {
                        return <div className="text-xs text-[var(--pm-text-tertiary)] italic">No skills recorded yet.</div>;
                      }
                      return memberSkills.map(us => {
                        const skillDef = skills.find(s => s.id === us.skill_id);
                        return (
                          <div key={us.id} className="flex justify-between items-center text-xs">
                            <span className="font-medium text-[var(--pm-text)]">{skillDef?.name || 'Unknown Skill'}</span>
                            <span className="text-[10px] uppercase tracking-wider text-[var(--pm-text-tertiary)] bg-[var(--pm-surface-highest)] px-2 py-0.5 rounded-full border border-[var(--pm-border)]">{us.level}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
