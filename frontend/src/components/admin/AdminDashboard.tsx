import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Terminal, Lock, X, AlertTriangle, Users, Database, Zap, Edit2, Trash2 } from 'lucide-react';
import { Project, Team, User, Profile, UserRole } from '../../types';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { hasCapability } from '../../core/auth/permissions';

export function AdminDashboard({
  profiles,
  teams,
  currentUserRole,
  systemData,
  onSaveSystemData,
  askConfirmation,
  onUpdateRole,
  onCreateTeam,
  onUpdateTeam,
  onDeleteTeam
}: {
  profiles: Profile[],
  teams: Team[],
  currentUserRole?: UserRole,
  systemData: any,
  onSaveSystemData: (data: any) => Promise<void>,
  askConfirmation: (title: string, message: string, onConfirm: () => void, confirmText?: string) => void,
  onUpdateRole: (id: string, role: UserRole) => void,
  onCreateTeam: (name: string, pmId: string, devIds: string[]) => void,
  onUpdateTeam: (id: string, name: string, pmId: string, devIds: string[]) => void,
  onDeleteTeam: (id: string) => void
}) {
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedPm, setSelectedPm] = useState('');
  const [selectedDevs, setSelectedDevs] = useState<string[]>([]);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');

  const { workspace, user: currentUserProfile } = useWorkspace();
  const canGovernPlatform = hasCapability(currentUserRole, 'platform_governance');

  const [invitations, setInvitations] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'pm' | 'developer' | 'viewer'>('developer');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const fetchInvitations = async () => {
    if (!canGovernPlatform) return;
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('status', 'pending');
    if (!error && data) {
      setInvitations(data);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, [canGovernPlatform]);

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError("Invalid email format.");
      return;
    }

    setInviting(true);
    setInviteError(null);

    try {
      if (!workspace?.id) throw new Error("Could not locate active workspace.");
      if (!currentUserProfile?.id) throw new Error("No active user profile.");

      const { data: existing } = await supabase
        .from('invitations')
        .select('*')
        .eq('email', email)
        .eq('workspace_id', workspace.id);

      if (existing && existing.length > 0) {
        throw new Error("This email is already invited.");
      }

      const { error: insertError } = await supabase
        .from('invitations')
        .insert({
          email,
          workspace_id: workspace.id,
          role: inviteRole,
          status: 'pending',
          invited_by: currentUserProfile.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });

      if (insertError) {
        throw insertError;
      }

      setInviteEmail('');
      fetchInvitations();
    } catch (err: any) {
      setInviteError(err?.message || "Failed to send invitation.");
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvitation = async (id: string) => {
    askConfirmation("Revoke Invitation", "Are you sure you want to revoke this invitation? The user will no longer be allowed to join.", async () => {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', id);
      if (!error) {
        fetchInvitations();
      }
    }, "Revoke");
  };

  const customRoles: string[] = systemData.customRoles || ['Developer', 'Designer', 'QA Engineer', 'Viewer'];
  const userCustomRoles: Record<string, string> = systemData.userCustomRoles || {};

  const handleAddCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    const cleanRoleName = newRoleName.trim();
    if (customRoles.some(r => r.toLowerCase() === cleanRoleName.toLowerCase())) {
      alert("This role designation already exists.");
      return;
    }
    const updatedRoles = [...customRoles, cleanRoleName];
    await onSaveSystemData({
      ...systemData,
      customRoles: updatedRoles
    });
    setNewRoleName('');
  };

  const handleDeleteCustomRole = async (roleToDelete: string) => {
    if (['viewer', 'developer', 'designer', 'qa engineer'].includes(roleToDelete.toLowerCase())) {
      alert("Cannot delete system default designations.");
      return;
    }

    askConfirmation("Confirm Deletion", `Are you sure you want to delete the custom designation '${roleToDelete}'? This will unassign it from all users.`, async () => {
      const updatedRoles = customRoles.filter(r => r !== roleToDelete);
      const updatedUserRoles = { ...userCustomRoles };
      Object.keys(updatedUserRoles).forEach(userId => {
        if (updatedUserRoles[userId] === roleToDelete) {
          delete updatedUserRoles[userId];
        }
      });

      await onSaveSystemData({
        ...systemData,
        customRoles: updatedRoles,
        userCustomRoles: updatedUserRoles
      });
    }, "Delete");
  };

  const handleAssignCustomRole = async (userId: string, roleName: string) => {
    const userProfile = profiles.find(p => p.id === userId);
    const targetName = userProfile?.full_name || userProfile?.email || "this user";

    askConfirmation("Confirm Designation Change", `Confirm action: Change designation of ${targetName} to '${roleName}'?`, async () => {
      const updatedUserRoles = {
        ...userCustomRoles,
        [userId]: roleName
      };
      await onSaveSystemData({
        ...systemData,
        userCustomRoles: updatedUserRoles
      });
    }, "Change");
  };

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName || !selectedPm) return;

    if (editingTeamId) {
      onUpdateTeam(editingTeamId, newTeamName, selectedPm, selectedDevs);
      setEditingTeamId(null);
    } else {
      onCreateTeam(newTeamName, selectedPm, selectedDevs);
    }

    setNewTeamName('');
    setSelectedPm('');
    setSelectedDevs([]);
  };

  const startEditing = (team: Team) => {
    setEditingTeamId(team.id);
    setNewTeamName(team.name);
    setSelectedPm((team.data as Record<string, unknown>)?.pm_id as string || '');
    setSelectedDevs((team.data as Record<string, unknown>)?.developer_ids as string[] || []);

    // Scroll to form
    const form = document.getElementById('team-form');
    if (form) form.scrollIntoView({ behavior: 'smooth' });
  };

  const cancelEditing = () => {
    setEditingTeamId(null);
    setNewTeamName('');
    setSelectedPm('');
    setSelectedDevs([]);
  };

  const pms = profiles.filter(p => hasCapability(p.role as UserRole, 'manage_projects'));
  const devs = profiles.filter(p => !hasCapability(p.role as UserRole, 'manage_projects'));

  // Identify devs already in other teams to prevent double-assignment
  const assignedDevIds = new Set(
    teams
      .filter(t => t.id !== editingTeamId)
      .flatMap(t => {
        const d = typeof t.data === 'string' ? JSON.parse(t.data) : t.data;
        return d?.developer_ids || [];
      })
  );

  const availableDevs = devs.filter(d => !assignedDevIds.has(d.id));

  return (
    <main className="w-full space-y-8 font-geist" style={{ color: 'var(--pm-on-surface)' }}>
      {/* --- Team Configuration & Custom Roles Section --- */}
      <div>
        <div className="mb-6 flex flex-col">
          <h2 className="text-xl font-semibold tracking-tight mb-1 flex items-center gap-2">
            <Terminal size={22} style={{ color: 'var(--pm-primary)' }} />
            {canGovernPlatform ? 'Workspace Configuration' : 'Active Delivery Units'}
          </h2>
          <p className="text-sm" style={{ color: 'var(--pm-on-surface-variant)' }}>
            {canGovernPlatform ? 'Initialize new delivery units, manage resource allocation, and configure roles.' : 'View active delivery units and current member allocation.'}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Team Configuration Form (Visible to Super Admin) */}
          {canGovernPlatform && (
            <div className="pm-card p-6 lg:col-span-4 flex flex-col justify-between" id="team-form">
              <div>
                <h3 className="font-semibold mb-6 flex items-center gap-2">
                  <Zap size={18} style={{ color: 'var(--pm-primary)' }} />
                  {editingTeamId ? 'Update Unit' : 'Create Unit'}
                </h3>
                <form onSubmit={handleCreateTeam} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-mono-pm uppercase tracking-widest mb-2" style={{ color: 'var(--pm-on-surface-variant)' }}>Unit Name</label>
                    <input
                      required
                      type="text"
                      value={newTeamName}
                      onChange={e => setNewTeamName(e.target.value)}
                      className="w-full border rounded-lg h-10 px-3 font-mono-pm text-xs outline-none transition-colors"
                      style={{ background: 'var(--pm-surface-lowest)', borderColor: 'rgba(70,69,84,0.3)', color: 'var(--pm-on-surface)' }}
                      placeholder="E.g. SQUAD_DELTA"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono-pm uppercase tracking-widest mb-2" style={{ color: 'var(--pm-on-surface-variant)' }}>Assign Unit Lead</label>
                    <select
                      required
                      value={selectedPm}
                      onChange={e => setSelectedPm(e.target.value)}
                      className="w-full border rounded-lg h-10 px-3 font-mono-pm text-xs outline-none transition-colors"
                      style={{ background: 'var(--pm-surface-lowest)', borderColor: 'rgba(70,69,84,0.3)', color: 'var(--pm-on-surface)' }}
                    >
                      <option value="" disabled>Select PM</option>
                      {pms.map(pm => (
                        <option key={pm.id} value={pm.id}>{pm.full_name || pm.email}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono-pm uppercase tracking-widest mb-2" style={{ color: 'var(--pm-on-surface-variant)' }}>Assign Team Members</label>
                    <div className="border rounded-lg max-h-40 overflow-y-auto p-2 space-y-1" style={{ background: 'var(--pm-surface-lowest)', borderColor: 'rgba(70,69,84,0.3)' }}>
                      {availableDevs.map(dev => (
                        <label key={dev.id} className="flex items-center gap-2 text-xs font-mono-pm cursor-pointer hover:bg-[var(--pm-surface)]/5 p-1.5 rounded transition-colors" style={{ color: 'var(--pm-on-surface-variant)' }}>
                          <input
                            type="checkbox"
                            className="accent-[var(--pm-primary)]"
                            checked={selectedDevs.includes(dev.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedDevs([...selectedDevs, dev.id]);
                              else setSelectedDevs(selectedDevs.filter(id => id !== dev.id));
                            }}
                          />
                          <span>{dev.full_name || dev.email}</span>
                        </label>
                      ))}
                      {availableDevs.length === 0 && <p className="text-[10px] italic p-1" style={{ color: 'var(--pm-on-surface-variant)' }}>No unassigned members available.</p>}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      className="flex-1 rounded-lg h-10 font-bold uppercase text-[10px] tracking-widest transition-all"
                      style={{ background: 'rgba(192,193,255,0.1)', color: 'var(--pm-primary)', border: '1px solid rgba(192,193,255,0.2)' }}
                      onMouseEnter={e => { (e.currentTarget as any).style.background = 'rgba(192,193,255,0.15)'; }}
                      onMouseLeave={e => { (e.currentTarget as any).style.background = 'rgba(192,193,255,0.1)'; }}
                    >
                      {editingTeamId ? 'Update Unit' : 'Create Unit'}
                    </button>
                    {editingTeamId && (
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="flex-1 rounded-lg h-10 font-bold uppercase text-[10px] tracking-widest transition-all"
                        style={{ background: 'var(--pm-surface-high)', color: 'var(--pm-on-surface-variant)', border: '1px solid rgba(70,69,84,0.3)' }}
                        onMouseEnter={e => { (e.currentTarget as any).style.background = 'var(--pm-surface-highest)'; }}
                        onMouseLeave={e => { (e.currentTarget as any).style.background = 'var(--pm-surface-high)'; }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Manage Custom Designations (Visible to Super Admin) */}
          {canGovernPlatform && (
            <div className="pm-card p-6 lg:col-span-4 flex flex-col justify-between">
              <div>
                <h3 className="font-semibold mb-6 flex items-center gap-2">
                  <Shield size={18} style={{ color: 'var(--pm-secondary)' }} />
                  Designation Registry
                </h3>
                <form onSubmit={handleAddCustomRole} className="space-y-4 mb-6">
                  <div>
                    <label className="block text-[10px] font-mono-pm uppercase tracking-widest mb-2" style={{ color: 'var(--pm-on-surface-variant)' }}>Create New Designation</label>
                    <div className="flex gap-2">
                      <input
                        required
                        type="text"
                        value={newRoleName}
                        onChange={e => setNewRoleName(e.target.value)}
                        className="flex-1 border rounded-lg h-10 px-3 font-mono-pm text-xs outline-none transition-colors"
                        style={{ background: 'var(--pm-surface-lowest)', borderColor: 'rgba(70,69,84,0.3)', color: 'var(--pm-on-surface)' }}
                        placeholder="e.g. Frontend Engineer"
                      />
                      <button
                        type="submit"
                        className="rounded-lg px-4 h-10 font-bold uppercase text-[10px] tracking-widest transition-all whitespace-nowrap"
                        style={{ background: 'rgba(195,198,213,0.1)', color: 'var(--pm-secondary)', border: '1px solid rgba(195,198,213,0.2)' }}
                        onMouseEnter={e => { (e.currentTarget as any).style.background = 'rgba(195,198,213,0.15)'; }}
                        onMouseLeave={e => { (e.currentTarget as any).style.background = 'rgba(195,198,213,0.1)'; }}
                      >
                        Create
                      </button>
                    </div>
                  </div>
                </form>

                <div>
                  <label className="block text-[10px] font-mono-pm uppercase tracking-widest mb-3" style={{ color: 'var(--pm-on-surface-variant)' }}>Active Designations</label>
                  <div className="divide-y rounded-lg border max-h-40 overflow-y-auto p-2" style={{ background: 'var(--pm-surface-lowest)', borderColor: 'rgba(70,69,84,0.3)' }}>
                    {customRoles.map(role => (
                      <div key={role} className="flex justify-between items-center py-2.5 px-2 hover:bg-[var(--pm-surface)]/5 transition-colors rounded">
                        <span className="text-xs font-mono-pm" style={{ color: 'var(--pm-on-surface-variant)' }}>{role}</span>
                        {!['viewer', 'developer', 'designer', 'qa engineer'].includes(role.toLowerCase()) ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomRole(role)}
                            className="text-[9px] font-mono-pm uppercase tracking-widest"
                            style={{ color: 'var(--pm-error)' }}
                          >
                            Delete
                          </button>
                        ) : (
                          <span className="text-[9px] font-mono-pm uppercase tracking-widest" style={{ color: 'rgba(199,196,215,0.4)' }}>System</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active Teams list */}
          <div className={`pm-card overflow-hidden flex flex-col ${canGovernPlatform ? 'lg:col-span-4' : 'lg:col-span-12'}`}>
            <h3 className="font-semibold p-6 border-b flex items-center gap-2" style={{ borderColor: 'rgba(70,69,84,0.3)', color: 'var(--pm-on-surface)' }}>
              <Users size={18} style={{ color: 'var(--pm-tertiary)' }} />
              Active Delivery Units
            </h3>
            <div className="overflow-y-auto p-6 space-y-4 flex-1 max-h-[400px]">
              {teams.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 opacity-50">
                  <Users className="w-8 h-8 mb-3" style={{ color: 'var(--pm-on-surface-variant)' }} />
                  <p className="text-xs font-mono-pm uppercase" style={{ color: 'var(--pm-on-surface-variant)' }}>No units created.</p>
                </div>
              )}
              {teams.map(team => {
                const pmId = (team.data as Record<string, unknown>)?.pm_id as string | undefined;
                const devIds = (team.data as Record<string, unknown>)?.developer_ids as string[] || [];
                const pm = profiles.find(p => p.id === pmId);
                const squadDevs = devIds.map((id: string) => profiles.find(p => p.id === id)).filter(Boolean);
                return (
                  <div key={team.id} className="p-4 rounded-xl transition-colors group" style={{ background: 'var(--pm-surface-lowest)', border: '1px solid rgba(70,69,84,0.3)' }}>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--pm-surface-high)', border: '1px solid rgba(70,69,84,0.3)' }}>
                          <Users className="w-4 h-4 transition-colors" style={{ color: 'var(--pm-tertiary)' }} />
                        </div>
                        <h4 className="font-semibold tracking-tight">{team.name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        {canGovernPlatform && (
                          <>
                            <button
                              onClick={() => startEditing(team)}
                              className="w-7 h-7 flex items-center justify-center rounded transition-colors"
                              style={{ color: 'var(--pm-on-surface-variant)', background: 'var(--pm-surface-high)' }}
                              onMouseEnter={e => { (e.currentTarget as any).style.color = 'var(--pm-primary)'; (e.currentTarget as any).style.background = 'rgba(192,193,255,0.1)'; }}
                              onMouseLeave={e => { (e.currentTarget as any).style.color = 'var(--pm-on-surface-variant)'; (e.currentTarget as any).style.background = 'var(--pm-surface-high)'; }}
                              title="Edit Unit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDeleteTeam(team.id)}
                              className="w-7 h-7 flex items-center justify-center rounded transition-colors"
                              style={{ color: 'var(--pm-on-surface-variant)', background: 'var(--pm-surface-high)' }}
                              onMouseEnter={e => { (e.currentTarget as any).style.color = 'var(--pm-error)'; (e.currentTarget as any).style.background = 'rgba(255,100,100,0.1)'; }}
                              onMouseLeave={e => { (e.currentTarget as any).style.color = 'var(--pm-on-surface-variant)'; (e.currentTarget as any).style.background = 'var(--pm-surface-high)'; }}
                              title="Archive Unit"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t" style={{ borderColor: 'rgba(70,69,84,0.2)' }}>
                      <div>
                        <p className="text-[10px] font-mono-pm uppercase tracking-widest mb-1.5" style={{ color: 'var(--pm-on-surface-variant)' }}>Unit Lead</p>
                        <p className="text-[11px] font-mono-pm flex items-center gap-1.5" style={{ color: 'var(--pm-tertiary)' }}>{pm?.full_name || pm?.email || 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-mono-pm uppercase tracking-widest mb-1.5" style={{ color: 'var(--pm-on-surface-variant)' }}>Team Members ({squadDevs.length})</p>
                        <div className="space-y-1">
                          {squadDevs.length === 0 && <p className="text-[10px] font-mono-pm italic" style={{ color: 'var(--pm-on-surface-variant)' }}>None assigned</p>}
                          {squadDevs.map(d => (
                            <p key={d?.id} className="text-[11px] font-mono-pm" style={{ color: 'var(--pm-on-surface-variant)' }}>{(d && userCustomRoles[d.id]) || d?.full_name || d?.email}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Invite Member & Pending Invitations (Visible to Super Admin) */}
          {canGovernPlatform && (
            <div className="pm-card p-6 lg:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Invite Form */}
              <div>
                <h3 className="font-semibold mb-6 flex items-center gap-2">
                  <Lock size={18} style={{ color: 'var(--pm-primary)' }} />
                  Invite Workspace Member
                </h3>
                <form onSubmit={handleSendInvitation} className="space-y-4">
                  {inviteError && (
                    <div className="border p-3 text-xs rounded-lg" style={{ borderColor: 'rgba(255,100,100,0.3)', background: 'rgba(255,100,100,0.05)', color: 'var(--pm-error)' }}>
                      {inviteError}
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-mono-pm uppercase tracking-widest mb-2" style={{ color: 'var(--pm-on-surface-variant)' }}>Member Email</label>
                    <input
                      required
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      className="w-full border rounded-lg h-10 px-3 font-mono-pm text-xs outline-none transition-colors"
                      style={{ background: 'var(--pm-surface-lowest)', borderColor: 'rgba(70,69,84,0.3)', color: 'var(--pm-on-surface)' }}
                      placeholder="teammate@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono-pm uppercase tracking-widest mb-2" style={{ color: 'var(--pm-on-surface-variant)' }}>Assigned Role</label>
                    <select
                      required
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value as any)}
                      className="w-full border rounded-lg h-10 px-3 font-mono-pm text-xs outline-none transition-colors"
                      style={{ background: 'var(--pm-surface-lowest)', borderColor: 'rgba(70,69,84,0.3)', color: 'var(--pm-on-surface)' }}
                    >
                      <option value="developer">Developer</option>
                      <option value="pm">Project Manager</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="w-full rounded-lg h-10 font-bold uppercase text-[10px] tracking-widest transition-all disabled:opacity-50"
                    style={{ background: 'rgba(192,193,255,0.1)', color: 'var(--pm-primary)', border: '1px solid rgba(192,193,255,0.2)' }}
                    onMouseEnter={e => { (e.currentTarget as any).style.background = 'rgba(192,193,255,0.15)'; }}
                    onMouseLeave={e => { (e.currentTarget as any).style.background = 'rgba(192,193,255,0.1)'; }}
                  >
                    {inviting ? 'Inviting...' : 'Send Invitation'}
                  </button>
                </form>
              </div>

              {/* Pending Invites List */}
              <div>
                <h3 className="font-semibold mb-6 flex items-center gap-2">
                  <Users size={18} style={{ color: 'var(--pm-tertiary)' }} />
                  Pending Invitations
                </h3>
                <div className="divide-y rounded-lg border max-h-[220px] overflow-y-auto p-4" style={{ background: 'var(--pm-surface-lowest)', borderColor: 'rgba(70,69,84,0.3)' }}>
                  {invitations.map(inv => (
                    <div key={inv.id} className="flex justify-between items-center py-3 hover:bg-[var(--pm-surface)]/5 transition-colors rounded px-2">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-mono-pm" style={{ color: 'var(--pm-on-surface-variant)' }}>{inv.email}</span>
                        <span className="text-[9px] font-mono-pm uppercase tracking-widest mt-1" style={{ color: 'var(--pm-primary)' }}>Role: {inv.role}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRevokeInvitation(inv.id)}
                        className="text-[9px] font-mono-pm uppercase tracking-widest px-3 py-1.5 rounded transition-all"
                        style={{ border: '1px solid rgba(255,100,100,0.3)', color: 'var(--pm-error)', background: 'rgba(255,100,100,0.05)' }}
                        onMouseEnter={e => { (e.currentTarget as any).style.background = 'rgba(255,100,100,0.1)'; }}
                        onMouseLeave={e => { (e.currentTarget as any).style.background = 'rgba(255,100,100,0.05)'; }}
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                  {invitations.length === 0 && (
                    <div className="text-center py-8 text-[11px] font-mono-pm italic" style={{ color: 'var(--pm-on-surface-variant)' }}>
                      No pending invitations.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
