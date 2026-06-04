import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useDashboard } from '../../context/DashboardContext';
import { CalendarIntelligencePanel } from '../../components/admin/CalendarIntelligencePanel';
import { hasCapability } from '../../core/auth/permissions';
import { Icon } from '../../components/ui/Icon';
import { supabase } from '../../lib/supabase';

type AdminTab = 'general' | 'identity' | 'calendar' | 'teams';

function getInitials(name: string) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function getRoleColor(role: string) {
  const r = role as UserRole;
  if (hasCapability(r, 'platform_governance')) return 'var(--pm-primary)';
  if (hasCapability(r, 'manage_projects')) return 'var(--pm-secondary)';
  if (hasCapability(r, 'view_stakeholders') && !hasCapability(r, 'manage_tasks')) return 'var(--pm-on-surface-variant)';
  return 'var(--pm-tertiary)';
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    super_admin: 'Super Admin',
    admin:       'Admin',
    manager:     'Project Manager',
    editor:      'Lead Analyst',
    viewer:      'Observer',
    member:      'Member',
  };
  return labels[role] || role?.replace('_', ' ') || 'Member';
}

function getAccessBar(role: string): number {
  const bars: Record<string, number> = { super_admin: 100, admin: 85, manager: 60, editor: 40, member: 25, viewer: 15 };
  return bars[role] ?? 25;
}

export function AdminPanel() {
  const { profile } = useAuth();
  const {
    profiles,
    teams,
    systemData,
    handleSaveLogisticsData,
    askConfirmation,
    handleUpdateRole,
    handleCreateTeam,
    handleUpdateTeam,
    handleDeleteTeam,
    notify,
    invalidateAll,
  } = useDashboard();

  const [tab, setTab] = useState<AdminTab>('identity');
  const [activeGearPopover, setActiveGearPopover] = useState<string | null>(null);

  const { workspace, user: currentUserProfile, updateWorkspaceSettings } = useWorkspace();
  const canGovernPlatform = hasCapability(profile?.role, 'platform_governance');
  const canViewCalendar = hasCapability(profile?.role, 'view_decision_center');

  // General Settings state
  const [companyName, setCompanyName] = useState(workspace?.settings?.companyName || workspace?.name || '');
  const [savingSettings, setSavingSettings] = useState(false);

  // Invitation state
  const [invitations, setInvitations] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'pm' | 'developer' | 'viewer'>('developer');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Team creation state
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedPm, setSelectedPm] = useState('');
  const [selectedDevs, setSelectedDevs] = useState<string[]>([]);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [showDesignations, setShowDesignations] = useState(false);
  const [newCustomDesignation, setNewCustomDesignation] = useState('');

  const pms = profiles.filter(p => hasCapability(p.role as UserRole, 'manage_projects'));
  const devs = profiles.filter(p => !hasCapability(p.role as UserRole, 'manage_projects'));
  const assignedDevIds = new Set(
    teams
      .filter(t => t.id !== editingTeamId)
      .flatMap(t => {
        const d = typeof t.data === 'string' ? JSON.parse(t.data) : t.data;
        return d?.developer_ids || [];
      })
  );
  const availableDevs = devs.filter(d => !assignedDevIds.has(d.id));

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

  const handleCreateTeamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName || !selectedPm) return;

    if (editingTeamId) {
      handleUpdateTeam(editingTeamId, newTeamName, selectedPm, selectedDevs);
      setEditingTeamId(null);
    } else {
      handleCreateTeam(newTeamName, selectedPm, selectedDevs);
    }

    setNewTeamName('');
    setSelectedPm('');
    setSelectedDevs([]);
  };

  const startEditingTeam = (team: any) => {
    setEditingTeamId(team.id);
    setNewTeamName(team.name);
    setSelectedPm((team.data as Record<string, unknown>)?.pm_id as string || '');
    setSelectedDevs((team.data as Record<string, unknown>)?.developer_ids as string[] || []);

    const form = document.getElementById('team-form');
    if (form) form.scrollIntoView({ behavior: 'smooth' });
  };

  const cancelEditingTeam = () => {
    setEditingTeamId(null);
    setNewTeamName('');
    setSelectedPm('');
    setSelectedDevs([]);
    setShowTeamForm(false);
  };

  const customRoles: string[] = systemData.customRoles || ['Developer', 'Designer', 'QA Engineer', 'Viewer'];
  const userCustomRoles: Record<string, string> = systemData.userCustomRoles || {};

  const handleAssignCustomRoleLocal = async (userId: string, roleName: string) => {
    const userProfile = profiles.find(p => p.id === userId);
    const targetName = userProfile?.full_name || userProfile?.email || "this user";

    askConfirmation("Confirm Designation Change", `Confirm action: Change designation of ${targetName} to '${roleName}'?`, async () => {
      const updatedUserRoles = {
        ...userCustomRoles,
        [userId]: roleName
      };
      await handleSaveLogisticsData({
        ...systemData,
        userCustomRoles: updatedUserRoles
      });
      setActiveGearPopover(null);
    }, "Change");
  };

  if (!hasCapability(profile?.role, 'platform_governance')) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 font-geist"
        style={{ color: 'var(--pm-on-surface-variant)' }}>
        <Icon name="lock" size={40} style={{ opacity: 0.3 }} />
        <div className="text-center">
          <p className="font-mono-pm text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--pm-error)' }}>
            ACCESS DENIED
          </p>
          <p className="text-sm">Admin governance privileges required to access this console.</p>
        </div>
      </div>
    );
  }

  const activeTeams = teams.filter(t => t.name !== 'SYSTEM_SETTINGS');
  const activeProfiles = profiles || [];

  const tabs: { id: AdminTab; label: string; icon: string }[] = [
    { id: 'general', label: 'General Settings', icon: 'settings' },
    { id: 'identity', label: 'Workspace Access', icon: 'groups' },
    { id: 'teams', label: 'Delivery Units', icon: 'hub' },
    ...(canViewCalendar ? [{ id: 'calendar' as AdminTab, label: 'Calendar Intelligence', icon: 'calendar_month' }] : []),
  ];

  return (
    <div className="flex flex-col gap-6 font-geist" style={{ color: 'var(--pm-on-surface)' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-end justify-between px-1 pt-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Access Control</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--pm-on-surface-variant)' }}>
            Manage workspace roles and access.
          </p>
        </div>
        <span className="font-mono-pm text-[10px] uppercase tracking-[0.2em] px-3 py-1 rounded"
          style={{ background: 'rgba(192,193,255,0.05)', border: '1px solid rgba(192,193,255,0.1)', color: 'var(--pm-primary)' }}>
          {activeProfiles.length} ACTIVE MEMBERS
        </span>
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b pb-0" style={{ borderColor: 'rgba(70,69,84,0.3)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all relative"
            style={{
              color: tab === t.id ? 'var(--pm-primary)' : 'var(--pm-on-surface-variant)',
              borderBottom: tab === t.id ? '2px solid var(--pm-primary)' : '2px solid transparent',
            }}>
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── General Settings Tab ───────────────────────────────── */}
      {tab === 'general' && (
        <div className="space-y-8">
          <div className="bg-surface-3/50 backdrop-blur-md border border-border/50 rounded-2xl p-6 lg:w-1/2 shadow-sm">
            <h3 className="font-semibold mb-6 flex items-center gap-2">
              <Icon name="business" size={18} style={{ color: 'var(--pm-primary)' }} />
              Organization Identity
            </h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setSavingSettings(true);
              try {
                await updateWorkspaceSettings({ companyName });
                notify("Organization Identity updated successfully.", "success");
              } catch (err) {
                notify("Failed to update organization identity.", "error");
              } finally {
                setSavingSettings(false);
              }
            }} className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono-pm uppercase tracking-widest mb-2" style={{ color: 'var(--pm-on-surface-variant)' }}>Company Name</label>
                <input
                  required
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  className="w-full border rounded-lg h-10 px-3 font-mono-pm text-xs outline-none transition-colors"
                  style={{ background: 'var(--pm-surface-lowest)', borderColor: 'rgba(70,69,84,0.3)', color: 'var(--pm-on-surface)' }}
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <button
                type="submit"
                disabled={savingSettings}
                className="w-full rounded-lg h-10 font-bold uppercase text-[10px] tracking-widest transition-all disabled:opacity-50"
                style={{ background: 'rgba(192,193,255,0.1)', color: 'var(--pm-primary)', border: '1px solid rgba(192,193,255,0.2)' }}
                onMouseEnter={e => { (e.currentTarget as any).style.background = 'rgba(192,193,255,0.15)'; }}
                onMouseLeave={e => { (e.currentTarget as any).style.background = 'rgba(192,193,255,0.1)'; }}
              >
                {savingSettings ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Workspace Access Tab ───────────────────────────────── */}
      {tab === 'identity' && (
        <div className="space-y-8">
          {/* Identity Table */}
          <div className="rounded-xl shadow-2xl"
            style={{ background: 'var(--pm-surface-low)', border: '1px solid rgba(70,69,84,0.3)' }}>
            <table className="w-full text-left border-collapse executive-table">
              <thead style={{ background: 'rgba(51,53,55,0.5)', borderBottom: '1px solid rgba(70,69,84,0.3)' }}>
                <tr>
                  {['Member', 'Role', 'Permissions', 'Settings'].map((h, i, arr) => (
                    <th key={h} className={`px-8 py-4 ${i === 0 ? 'rounded-tl-xl' : ''} ${i === arr.length - 1 ? 'rounded-tr-xl' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'rgba(70,69,84,0.1)' }}>
                {activeProfiles.map((p: any) => {
                  const roleColor = getRoleColor(p.role);
                  const accessPct = getAccessBar(p.role);
                  const initials = getInitials(p.full_name || p.email || '');
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(70,69,84,0.1)' }}>
                      {/* Member */}
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
                            style={{ background: `${roleColor}18`, border: `1px solid ${roleColor}30`, color: roleColor }}>
                            {initials}
                          </div>
                          <div>
                            <div className="font-medium" style={{ color: 'var(--pm-on-surface)' }}>
                              {p.full_name || 'Unknown'}
                            </div>
                            <div className="font-mono-pm text-[11px] mt-0.5 uppercase"
                              style={{ color: 'var(--pm-on-surface-variant)', opacity: 0.6 }}>
                              {p.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      {/* Role */}
                      <td className="px-8 py-5">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider"
                          style={{ background: `${roleColor}12`, color: roleColor, border: `1px solid ${roleColor}25` }}>
                          {getRoleLabel(p.role)}
                        </span>
                      </td>
                      {/* Permissions bar */}
                      <td className="px-8 py-5">
                        <div className="w-40 space-y-1.5">
                          <div className="h-1.5 w-full rounded-full overflow-hidden"
                            style={{ background: 'rgba(70,69,84,0.2)' }}>
                            <div className="h-full rounded-full"
                              style={{ width: `${accessPct}%`, background: roleColor, boxShadow: accessPct === 100 ? `0 0 8px ${roleColor}60` : 'none' }} />
                          </div>
                          <span className="font-mono-pm text-[9px] uppercase tracking-widest"
                            style={{ color: roleColor, opacity: 0.8 }}>
                            {accessPct === 100 ? 'Full Access' : accessPct >= 60 ? 'Admin Access' : 'Standard Access'}
                          </span>
                        </div>
                      </td>
                      {/* Controls */}
                      <td className="px-8 py-5 relative">
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                          style={{ 
                            color: activeGearPopover === p.id ? 'var(--pm-primary)' : 'var(--pm-on-surface-variant)', 
                            background: activeGearPopover === p.id ? 'rgba(192,193,255,0.1)' : '' 
                          }}
                          onMouseEnter={e => { if (activeGearPopover !== p.id) { (e.currentTarget as any).style.color = 'var(--pm-primary)'; (e.currentTarget as any).style.background = 'rgba(192,193,255,0.1)'; } }}
                          onMouseLeave={e => { if (activeGearPopover !== p.id) { (e.currentTarget as any).style.color = 'var(--pm-on-surface-variant)'; (e.currentTarget as any).style.background = ''; } }}
                          onClick={() => setActiveGearPopover(activeGearPopover === p.id ? null : p.id)}
                          title="Manage identity">
                          <Icon name="settings_suggest" size={18} />
                        </button>

                        {activeGearPopover === p.id && (
                          <div className="absolute right-12 top-12 w-64 rounded-xl shadow-2xl z-50 p-5 flex flex-col gap-4"
                            style={{ background: 'var(--pm-surface-high)', border: '1px solid rgba(70,69,84,0.3)' }}>
                            <div className="text-[10px] font-mono-pm uppercase tracking-widest text-center border-b pb-2" style={{ borderColor: 'rgba(70,69,84,0.1)', color: 'var(--pm-on-surface-variant)' }}>
                              Security &amp; Governance
                            </div>
                            
                            {p.role !== 'super_admin' ? (
                              <>
                                {/* Role Calibration */}
                                <div className="mb-4 space-y-3 border-b pb-4" style={{ borderColor: 'rgba(70,69,84,0.2)' }}>
                                  <div>
                                    <label className="block text-[9px] font-mono-pm uppercase tracking-widest mb-1.5" style={{ color: 'var(--pm-on-surface-variant)' }}>Access Role</label>
                                    <select
                                      value={p.role}
                                      onChange={(e) => {
                                        const roleVal = e.target.value;
                                        askConfirmation("Change Access Role", `Confirm action: Change access role of ${p.full_name || p.email} to '${roleVal}'?`, async () => {
                                          await handleUpdateRole(p.id, roleVal as any);
                                          notify("Access role updated successfully.", "success");
                                        });
                                      }}
                                      className="w-full border rounded text-[11px] font-mono-pm px-2 py-1.5 outline-none bg-bg"
                                      style={{ borderColor: 'rgba(70,69,84,0.3)', color: 'var(--pm-on-surface)', background: 'var(--pm-surface-lowest)' }}
                                    >
                                      <option value="viewer">Viewer</option>
                                      <option value="developer">Developer</option>
                                      <option value="pm">Project Manager</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[9px] font-mono-pm uppercase tracking-widest mb-1.5" style={{ color: 'var(--pm-on-surface-variant)' }}>Designation</label>
                                    <select
                                      value={userCustomRoles[p.id] || 'Viewer'}
                                      onChange={(e) => handleAssignCustomRoleLocal(p.id, e.target.value)}
                                      className="w-full border rounded text-[11px] font-mono-pm px-2 py-1.5 outline-none bg-bg"
                                      style={{ borderColor: 'rgba(70,69,84,0.3)', color: 'var(--pm-on-surface)', background: 'var(--pm-surface-lowest)' }}
                                    >
                                      {customRoles.map(r => (
                                        <option key={r} value={r}>{r}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                {/* Enable / Disable Account Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveGearPopover(null);
                                    const isDisabled = !hasCapability(p.role as UserRole, 'view_projects');
                                    const actionText = isDisabled ? "Enable" : "Disable";
                                    askConfirmation(
                                      `${actionText} Account`,
                                      `Are you sure you want to ${actionText.toLowerCase()} access for ${p.full_name || p.email}?`,
                                      async () => {
                                        const targetRole = isDisabled ? 'developer' : 'uninvited';
                                        await handleUpdateRole(p.id, targetRole);
                                        notify(`Account for ${p.full_name || p.email} has been ${isDisabled ? 'enabled' : 'disabled'}.`, "success");
                                      },
                                      actionText
                                    );
                                  }}
                                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-[11px] font-mono-pm uppercase tracking-widest transition-all"
                                  style={{
                                    background: !hasCapability(p.role as UserRole, 'view_projects') ? 'rgba(52,211,153,0.1)' : 'rgba(245,158,11,0.1)',
                                    color: !hasCapability(p.role as UserRole, 'view_projects') ? 'var(--pm-primary)' : 'var(--pm-secondary)',
                                    border: !hasCapability(p.role as UserRole, 'view_projects') ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(245,158,11,0.2)'
                                  }}
                                >
                                  <Icon name={!hasCapability(p.role as UserRole, 'view_projects') ? "person" : "block"} size={14} />
                                  {!hasCapability(p.role as UserRole, 'view_projects') ? 'Enable Account' : 'Disable Account'}
                                </button>

                                {/* Remove Person Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveGearPopover(null);
                                    askConfirmation(
                                      "Remove Person",
                                      `Are you sure you want to delete ${p.full_name || p.email} entirely from the database? This action is irreversible.`,
                                      async () => {
                                        const { error } = await supabase.from('users').delete().eq('id', p.id);
                                        if (!error) {
                                          notify("Member removed entirely from database.", "success");
                                          invalidateAll();
                                        } else {
                                          notify(`Failed to remove member: ${error.message}`, "error");
                                        }
                                      },
                                      "Remove"
                                    );
                                  }}
                                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-[11px] font-mono-pm uppercase tracking-widest transition-all"
                                  style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--pm-error)', border: '1px solid rgba(239,68,68,0.2)' }}
                                >
                                  <Icon name="person_remove" size={14} />
                                  Remove Person
                                </button>
                              </>
                            ) : (
                              <span className="text-[10px] font-mono-pm uppercase italic text-center text-text-tertiary">Super Admin Protected</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Control & Capabilities Center */}
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2 mb-5"
              style={{ color: 'var(--pm-on-surface)' }}>
              <Icon name="terminal" size={20} style={{ color: 'var(--pm-primary)' }} />
              Workspace Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Invite Member */}
              <div 
                className="bg-surface-3/50 backdrop-blur-md border border-border/50 rounded-2xl p-7 group relative overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-shadow"
                onClick={() => setShowInviteForm(!showInviteForm)}
              >
                <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-all"
                  style={{ background: 'rgba(192,193,255,0.08)' }} />
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-transform group-hover:scale-105"
                  style={{ background: 'rgba(192,193,255,0.08)', border: '1px solid rgba(192,193,255,0.15)' }}>
                  <Icon name="person_add" size={24} style={{ color: 'var(--pm-primary)' }} />
                </div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--pm-on-surface)' }}>Workspace Invitations</h3>
                <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--pm-on-surface-variant)' }}>
                  Invite new members to the workspace and manage pending invitations.
                </p>
                <div className="flex items-center gap-2 font-mono-pm text-[11px] uppercase tracking-[0.2em]"
                  style={{ color: 'var(--pm-primary)' }}>
                  <span>{showInviteForm ? 'Close Form' : 'Open Form'}</span>
                  <Icon name="arrow_forward" size={14} className={`transition-transform ${showInviteForm ? 'rotate-90' : 'group-hover:translate-x-1'}`} />
                </div>
              </div>

              {/* Designations */}
              <div 
                className="bg-surface-3/50 backdrop-blur-md border border-border/50 rounded-2xl p-7 group relative overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-shadow"
                onClick={() => {
                  setShowDesignations(!showDesignations);
                  if (!showDesignations) {
                    setShowInviteForm(false);
                  }
                }}
              >
                <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-all"
                  style={{ background: 'rgba(192,193,255,0.05)' }} />
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-transform group-hover:scale-105"
                  style={{ background: 'rgba(192,193,255,0.08)', border: '1px solid rgba(192,193,255,0.15)' }}>
                  <Icon name="admin_panel_settings" size={24} style={{ color: 'var(--pm-secondary)' }} />
                </div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--pm-on-surface)' }}>Designation Registry</h3>
                <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--pm-on-surface-variant)' }}>
                  Manage custom roles and professional designations across the workspace.
                </p>
                <div className="flex items-center gap-2 font-mono-pm text-[11px] uppercase tracking-[0.2em]"
                  style={{ color: 'var(--pm-secondary)' }}>
                  <span>{showDesignations ? 'Close Registry' : 'Manage Designations'}</span>
                  <Icon name="arrow_forward" size={14} className={`transition-transform ${showDesignations ? 'rotate-90' : 'group-hover:translate-x-1'}`} />
                </div>
              </div>

              {/* System Overview */}
              <div className="bg-surface-3/50 backdrop-blur-md border border-border/50 rounded-2xl p-7 flex flex-col shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <span className="font-mono-pm text-[10px] uppercase tracking-[0.3em]"
                    style={{ color: 'var(--pm-on-surface-variant)' }}>
                    System Overview
                  </span>
                  <span className="font-mono-pm text-[9px] px-2 py-0.5 rounded font-bold"
                    style={{ background: 'rgba(255,183,131,0.1)', color: 'var(--pm-tertiary)', border: '1px solid rgba(255,183,131,0.2)' }}>
                    LIVE
                  </span>
                </div>
                <div className="flex-1 flex flex-col justify-center gap-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider"
                      style={{ color: 'var(--pm-on-surface-variant)' }}>
                      Active Members
                    </span>
                    <span className="font-mono-pm text-xl font-bold"
                      style={{ color: 'var(--pm-primary)' }}>
                      {activeProfiles.length}
                    </span>
                  </div>
                  {/* Mini bar chart */}
                  <div className="h-12 flex items-end gap-1">
                    {[30, 45, 75, 40, 65, 80, 25, 50, 80, 35].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t-sm transition-all"
                        style={{ height: `${h}%`, background: `rgba(192,193,255,${0.1 + (h / 100) * 0.7})` }} />
                    ))}
                  </div>
                </div>
                <div className="mt-4 pt-4 flex items-center gap-2"
                  style={{ borderTop: '1px solid rgba(70,69,84,0.2)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                    style={{ boxShadow: '0 0 6px rgba(52,211,153,0.5)' }} />
                  <p className="font-mono-pm text-[9px] uppercase tracking-widest"
                    style={{ color: 'var(--pm-on-surface-variant)', opacity: 0.6 }}>
                    Systems operational
                  </p>
                </div>
              </div>
            </div>
            
            {showInviteForm && canGovernPlatform && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                <div className="bg-surface-3/50 backdrop-blur-md border border-border/50 rounded-2xl p-6 shadow-sm">
                  <h3 className="font-semibold mb-6 flex items-center gap-2">
                    <Icon name="lock" size={18} style={{ color: 'var(--pm-primary)' }} />
                    Send Invitation
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
                
                <div className="bg-surface-3/50 backdrop-blur-md border border-border/50 rounded-2xl p-6 shadow-sm">
                  <h3 className="font-semibold mb-6 flex items-center gap-2">
                    <Icon name="group" size={18} style={{ color: 'var(--pm-tertiary)' }} />
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

            {showDesignations && (
              <div className="bg-surface-3/50 backdrop-blur-md border border-border/50 rounded-2xl p-6 mt-5 space-y-6 shadow-sm">
                <div className="flex justify-between items-center border-b pb-4" style={{ borderColor: 'rgba(70,69,84,0.3)' }}>
                  <div>
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <Icon name="admin_panel_settings" size={22} style={{ color: 'var(--pm-secondary)' }} />
                      Designation Registry
                    </h3>
                    <p className="text-xs text-text-tertiary mt-1">Configure professional designations and map workspace roles.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Create Custom Designation Form */}
                  <div className="lg:col-span-1 border-r pr-6 space-y-4" style={{ borderColor: 'rgba(70,69,84,0.2)' }}>
                    <h4 className="font-mono-pm text-[11px] uppercase tracking-widest text-text-secondary">Register Custom Designation</h4>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const name = newCustomDesignation.trim();
                        if (!name) return;
                        if (customRoles.includes(name)) {
                          notify("Designation already exists.", "warning");
                          return;
                        }
                        const updated = [...customRoles, name];
                        await handleSaveLogisticsData({
                          ...systemData,
                          customRoles: updated
                        });
                        setNewCustomDesignation('');
                        notify(`Designation '${name}' added to workspace registry.`, "success");
                      }}
                      className="space-y-4"
                    >
                      <div>
                        <label className="block text-[9px] font-mono-pm uppercase tracking-widest mb-1.5" style={{ color: 'var(--pm-on-surface-variant)' }}>Designation Label</label>
                        <input
                          required
                          type="text"
                          value={newCustomDesignation}
                          onChange={e => setNewCustomDesignation(e.target.value)}
                          className="w-full border rounded-lg h-10 px-3 font-mono-pm text-xs outline-none focus:border-white/40 transition-all text-text-primary bg-bg"
                          style={{ borderColor: 'rgba(70,69,84,0.3)' }}
                          placeholder="e.g. Lead QA Engineer"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full rounded-lg h-10 font-bold uppercase text-[10px] tracking-widest transition-all"
                        style={{ background: 'rgba(192,193,255,0.1)', color: 'var(--pm-primary)', border: '1px solid rgba(192,193,255,0.2)' }}
                      >
                        Add Designation
                      </button>
                    </form>
                  </div>

                  {/* Registry Assignments have been migrated to the workspace identity gear menu */}
                  <div className="lg:col-span-2 space-y-4">
                    <h4 className="font-mono-pm text-[11px] uppercase tracking-widest text-text-secondary">Assignments Migrated</h4>
                    <div className="p-6 border rounded-lg flex flex-col items-center justify-center text-center" style={{ borderColor: 'rgba(70,69,84,0.3)', background: 'var(--pm-surface-lowest)' }}>
                      <Icon name="info" size={24} style={{ color: 'var(--pm-on-surface-variant)' }} className="mb-3" />
                      <p className="text-sm font-medium mb-1" style={{ color: 'var(--pm-on-surface)' }}>Role Assignments Relocated</p>
                      <p className="text-xs" style={{ color: 'var(--pm-on-surface-variant)' }}>
                        You can now change member access roles and custom designations directly from the gear icon in the Workspace Access table.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>


        </div>
      )}

      {/* ── Delivery Units Tab ───────────────────────────────── */}
      {tab === 'teams' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeTeams.map((team: any) => (
              <div key={team.id} className="bg-surface-3/50 backdrop-blur-md border border-border/50 rounded-2xl p-6 group shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-5">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--pm-surface-highest)', border: '1px solid rgba(70,69,84,0.3)', color: 'var(--pm-primary)' }}>
                    <Icon name="hub" size={20} />
                  </div>
                  <span className="font-mono-pm text-[9px] font-bold uppercase tracking-widest pm-badge-success">
                    ACTIVE
                  </span>
                </div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--pm-on-surface)' }}>{team.name}</h3>
                <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--pm-on-surface-variant)' }}>
                  {team.description || 'Delivery unit within the workspace.'}
                </p>
                <div className="flex justify-between items-center">
                  <div className="flex -space-x-2">
                    {(team.members || []).slice(0, 3).map((m: any, i: number) => (
                      <div key={i} className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[9px] font-bold"
                        style={{ borderColor: 'var(--pm-surface-low)', background: 'var(--pm-surface-highest)', color: 'var(--pm-primary)' }}>
                        {getInitials(m.name || m)}
                      </div>
                    ))}
                    {(team.members?.length || 0) > 3 && (
                      <div className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[9px] font-bold"
                        style={{ borderColor: 'var(--pm-surface-low)', background: 'var(--pm-surface-highest)', color: 'var(--pm-on-surface-variant)' }}>
                        +{(team.members?.length || 0) - 3}
                      </div>
                    )}
                  </div>
                  <Icon name="open_in_new" size={18}
                    className="transition-colors group-hover:text-primary"
                    style={{ color: 'rgba(199,196,215,0.3)' }} />
                </div>

                {/* Governance buttons */}
                <div className="flex gap-2 mt-4 pt-4 border-t" style={{ borderColor: 'rgba(70,69,84,0.1)' }}>
                  <button
                    type="button"
                    onClick={() => {
                      startEditingTeam(team);
                      setShowTeamForm(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded text-[10px] font-mono-pm uppercase tracking-wider transition-all"
                    style={{ background: 'rgba(192,193,255,0.05)', border: '1px solid rgba(192,193,255,0.1)', color: 'var(--pm-primary)' }}
                    onMouseEnter={e => { (e.currentTarget as any).style.background = 'rgba(192,193,255,0.1)'; }}
                    onMouseLeave={e => { (e.currentTarget as any).style.background = 'rgba(192,193,255,0.05)'; }}
                  >
                    <Icon name="edit" size={12} />
                    Edit Unit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      askConfirmation(
                        "Delete Delivery Unit",
                        `Are you sure you want to delete the delivery unit "${team.name}"? This action cannot be undone.`,
                        async () => {
                          await handleDeleteTeam(team.id);
                          notify("Delivery unit deleted successfully.", "success");
                        },
                        "Delete"
                      );
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded text-[10px] font-mono-pm uppercase tracking-wider transition-all"
                    style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)', color: 'var(--pm-error)' }}
                    onMouseEnter={e => { (e.currentTarget as any).style.background = 'rgba(239,68,68,0.1)'; }}
                    onMouseLeave={e => { (e.currentTarget as any).style.background = 'rgba(239,68,68,0.05)'; }}
                  >
                    <Icon name="delete" size={12} />
                    Delete Unit
                  </button>
                </div>
              </div>
            ))}

            {/* Add team slot */}
            <button className="rounded-xl p-6 flex flex-col items-center justify-center gap-3 transition-all"
              style={{ border: '2px dashed rgba(70,69,84,0.4)', background: showTeamForm ? 'rgba(192,193,255,0.05)' : '' }}
              onMouseEnter={e => { (e.currentTarget as any).style.borderColor = 'rgba(192,193,255,0.4)'; (e.currentTarget as any).style.background = 'rgba(192,193,255,0.03)'; }}
              onMouseLeave={e => { (e.currentTarget as any).style.borderColor = 'rgba(70,69,84,0.4)'; (e.currentTarget as any).style.background = showTeamForm ? 'rgba(192,193,255,0.05)' : ''; }}
              onClick={() => {
                setShowTeamForm(!showTeamForm);
                if (!showTeamForm) setEditingTeamId(null);
              }}>
              <Icon name={showTeamForm ? "remove_circle" : "add_circle"} size={32} style={{ color: 'var(--pm-on-surface-variant)' }} />
              <span className="font-mono-pm text-[10px] uppercase tracking-[0.3em] font-bold"
                style={{ color: 'var(--pm-on-surface-variant)' }}>
                {showTeamForm ? 'Close Form' : 'Create Unit'}
              </span>
            </button>
          </div>

          {(showTeamForm || editingTeamId) && (
            <div className="bg-surface-3/50 backdrop-blur-md border border-border/50 rounded-2xl p-6 mt-5 shadow-sm" id="team-form">
              <h3 className="font-semibold mb-6 flex items-center gap-2">
                <Icon name="offline_bolt" size={18} style={{ color: 'var(--pm-primary)' }} />
                {editingTeamId ? 'Update Delivery Unit' : 'Initialize Delivery Unit'}
              </h3>
              <form onSubmit={handleCreateTeamSubmit} className="space-y-4 max-w-xl">
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
                    <option value="" disabled>Select Unit Lead</option>
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
                      onClick={cancelEditingTeam}
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
          )}
        </div>
      )}

      {/* ── Calendar Intelligence Tab ───────────────────────────── */}
      {tab === 'calendar' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(70,69,84,0.3)' }}>
          <CalendarIntelligencePanel />
        </div>
      )}
    </div>
  );
}
