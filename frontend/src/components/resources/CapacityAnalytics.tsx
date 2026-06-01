import React, { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../context/DashboardContext';
import { useOperationalData } from '../../context/OperationalDataContext';
import { Users, FileText, ChevronRight, AlertCircle, Calendar, Briefcase, Activity } from 'lucide-react';

export function CapacityAnalytics() {
  const { profiles, teams, tasks, projects } = useDashboard();
  const { raw: { attendanceRows } } = useOperationalData();

  const analyticsData = useMemo(() => {
    let totalWorkloadHours = 0;
    let totalCapacityHours = 0;
    let overallocatedCount = 0;
    
    // Calculate team distribution
    const activeTeams = teams.filter((t: any) => t.name !== 'SYSTEM_SETTINGS');
    
    const memberStats = activeTeams.flatMap((team: any) => {
      const devIds = team.data?.developer_ids || [];
      const pmId = team.data?.pm_id;
      const allIds = [pmId, ...devIds].filter(Boolean);
      
      return allIds.map((id: string) => {
        const p = profiles.find((prof: any) => prof.id === id);
        
        // Active tasks load
        const memberTasks = tasks.filter((t: any) => t.assignee_id === id && t.status !== 'done');
        const workloadHours = memberTasks.reduce((s: number, t: any) => s + (t.estimated_hours || 8), 0);
        
        // Default capacity: 40 hours a week
        const capacityHours = 40;
        
        totalWorkloadHours += workloadHours;
        totalCapacityHours += capacityHours;
        
        if (workloadHours > capacityHours * 1.2) {
          overallocatedCount++;
        }
        
        return {
          id,
          name: p?.full_name || p?.email || 'Unknown Member',
          teamName: team.name,
          role: id === pmId ? 'Lead' : 'Engineer',
          workloadHours,
          capacityHours,
          utilization: Math.round((workloadHours / capacityHours) * 100)
        };
      });
    });

    // Upcoming Leaves based on attendance table (status = 'leave')
    const upcomingLeaves = attendanceRows
      ?.filter((r: any) => r.status === 'leave' && new Date(r.date) >= new Date())
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5) || [];
      
    // Today's attendance summary
    const todayStr = new Date().toISOString().split('T')[0];
    const todaysAttendance = attendanceRows?.filter((r: any) => r.date === todayStr) || [];
    const presentCount = todaysAttendance.filter((r: any) => r.status === 'present' || r.status === 'remote').length;
    const leaveCount = todaysAttendance.filter((r: any) => r.status === 'leave').length;

    return {
      memberStats: memberStats.sort((a, b) => b.utilization - a.utilization),
      teamDistribution: activeTeams,
      totalWorkloadHours,
      totalCapacityHours,
      utilizationAvg: totalCapacityHours ? Math.round((totalWorkloadHours / totalCapacityHours) * 100) : 0,
      overallocatedCount,
      upcomingLeaves,
      attendanceSummary: {
        present: presentCount,
        leave: leaveCount,
        total: profiles.length
      }
    };
  }, [profiles, tasks, teams, attendanceRows]);

  const renderAvatar = (name: string) => {
    const init = name.substring(0, 2).toUpperCase();
    return (
      <div className="w-8 h-8 rounded-full bg-[var(--pm-surface)] border border-[var(--pm-border)] flex items-center justify-center text-xs font-medium text-[var(--pm-text-secondary)] shadow-sm">
        {init}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-16 font-sans animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-end justify-between px-1 pt-2 mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--pm-text)]">
            Team Workload & Capacity
          </h1>
          <p className="text-sm mt-1 text-[var(--pm-text-secondary)]">
            Real-time insights into resource utilization, allocation limits, and team availability.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-[var(--pm-surface-elevated)] border border-[var(--pm-border)] rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-[var(--pm-surface-hover)] transition-colors text-[var(--pm-text)] shadow-sm cursor-pointer">
            <FileText className="w-4 h-4"/> Export Report
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--pm-surface-elevated)] rounded-xl border border-[var(--pm-border)] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-[var(--pm-text-secondary)]">Overall Utilization</div>
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Activity className="w-4 h-4 text-blue-500" />
            </div>
          </div>
          <div className="text-3xl font-bold text-[var(--pm-text)]">
            {analyticsData.utilizationAvg}%
          </div>
          <div className="text-xs text-[var(--pm-text-tertiary)] mt-2">
            {analyticsData.totalWorkloadHours}h / {analyticsData.totalCapacityHours}h allocated
          </div>
        </div>

        <div className="bg-[var(--pm-surface-elevated)] rounded-xl border border-[var(--pm-border)] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-[var(--pm-text-secondary)]">Overallocated</div>
            <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
          </div>
          <div className="text-3xl font-bold text-[var(--pm-text)]">
            {analyticsData.overallocatedCount}
          </div>
          <div className="text-xs text-[var(--pm-text-tertiary)] mt-2">
            Team members exceeding 120% capacity
          </div>
        </div>

        <div className="bg-[var(--pm-surface-elevated)] rounded-xl border border-[var(--pm-border)] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-[var(--pm-text-secondary)]">Active Teams</div>
            <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-indigo-500" />
            </div>
          </div>
          <div className="text-3xl font-bold text-[var(--pm-text)]">
            {analyticsData.teamDistribution.length}
          </div>
          <div className="text-xs text-[var(--pm-text-tertiary)] mt-2">
            Spanning {analyticsData.memberStats.length} total active members
          </div>
        </div>

        <div className="bg-[var(--pm-surface-elevated)] rounded-xl border border-[var(--pm-border)] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-[var(--pm-text-secondary)]">Today's Attendance</div>
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-emerald-500" />
            </div>
          </div>
          <div className="text-3xl font-bold text-[var(--pm-text)]">
            {analyticsData.attendanceSummary.present} <span className="text-lg text-[var(--pm-text-secondary)] font-normal">/ {analyticsData.attendanceSummary.total}</span>
          </div>
          <div className="text-xs text-[var(--pm-text-tertiary)] mt-2">
            {analyticsData.attendanceSummary.leave} members on leave today
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 pt-4">
        {/* Main Utilization List */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-[var(--pm-surface-elevated)] rounded-xl border border-[var(--pm-border)] overflow-hidden shadow-sm">
            <div className="p-5 border-b border-[var(--pm-border)] bg-[var(--pm-surface)]/50 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--pm-text)]">Member Utilization</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[var(--pm-surface)]/30 text-[var(--pm-text-secondary)] text-xs border-b border-[var(--pm-border)]">
                  <tr>
                    <th className="px-5 py-3 font-medium">Member</th>
                    <th className="px-5 py-3 font-medium">Team</th>
                    <th className="px-5 py-3 font-medium">Workload</th>
                    <th className="px-5 py-3 font-medium w-1/3">Utilization</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--pm-border)]/50">
                  {analyticsData.memberStats.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-[var(--pm-text-secondary)]">No active members found.</td>
                    </tr>
                  ) : (
                    analyticsData.memberStats.map((member: any) => (
                      <tr key={member.id} className="hover:bg-[var(--pm-surface-hover)] transition-colors group">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {renderAvatar(member.name)}
                            <div>
                              <div className="font-medium text-[var(--pm-text)]">{member.name}</div>
                              <div className="text-xs text-[var(--pm-text-secondary)]">{member.role}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--pm-surface-3)] text-[var(--pm-text-secondary)]">
                            {member.teamName}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[var(--pm-text)] font-medium">{member.workloadHours}h</span>
                          <span className="text-[var(--pm-text-secondary)] text-xs ml-1">/ {member.capacityHours}h</span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-[var(--pm-surface-3)] rounded-full overflow-hidden max-w-[120px]">
                              <div 
                                className="h-full rounded-full transition-all" 
                                style={{ 
                                  width: `${Math.min(100, member.utilization)}%`,
                                  backgroundColor: member.utilization > 100 ? 'var(--pm-risk)' : (member.utilization > 80 ? 'var(--pm-warning)' : 'var(--pm-success)')
                                }} 
                              />
                            </div>
                            <span className="text-xs font-medium" style={{ color: member.utilization > 100 ? 'var(--pm-risk)' : 'var(--pm-text)' }}>
                              {member.utilization}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-6">
          <div className="bg-[var(--pm-surface-elevated)] rounded-xl border border-[var(--pm-border)] overflow-hidden shadow-sm">
            <div className="p-5 border-b border-[var(--pm-border)] bg-[var(--pm-surface)]/50">
              <h2 className="text-lg font-semibold text-[var(--pm-text)]">Upcoming Leaves</h2>
            </div>
            <div className="p-5">
              {analyticsData.upcomingLeaves.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-[var(--pm-text-tertiary)]">
                  <Calendar className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No upcoming leaves scheduled.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {analyticsData.upcomingLeaves.map((leave: any, idx: number) => {
                    const p = profiles.find((prof: any) => prof.id === leave.profile_id);
                    return (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[var(--pm-surface-3)] flex flex-col items-center justify-center border border-[var(--pm-border)]">
                          <span className="text-[10px] uppercase font-bold text-[var(--pm-text-tertiary)]">
                            {new Date(leave.date).toLocaleString('default', { month: 'short' })}
                          </span>
                          <span className="text-sm font-semibold text-[var(--pm-text)]">
                            {new Date(leave.date).getDate()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--pm-text)]">{p?.full_name || p?.email || 'Unknown'}</p>
                          <p className="text-xs text-[var(--pm-text-secondary)]">Scheduled Leave</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          
          <div className="bg-[var(--pm-surface-elevated)] rounded-xl border border-[var(--pm-border)] overflow-hidden shadow-sm p-5">
            <h3 className="text-sm font-medium text-[var(--pm-text)] mb-3">Resource Allocation Note</h3>
            <p className="text-sm text-[var(--pm-text-secondary)] leading-relaxed">
              Workload is calculated by aggregating active tasks assigned to each member across all projects. Members marked as overallocated may require load balancing to prevent burnout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
