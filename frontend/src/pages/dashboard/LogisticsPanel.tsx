import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../context/DashboardContext';
import { LogisticsDashboard } from '../../components/admin/LogisticsDashboard';
import { hasCapability } from '../../core/auth/permissions';
import { Icon } from '../../components/ui/Icon';

export function LogisticsPanel() {
  const { profile } = useAuth();
  const {
    profiles,
    teams,
    projects,
    tasks,
    updateTask,
    systemData,
    handleSaveLogisticsData
  } = useDashboard();

  if (!hasCapability(profile?.role, 'manage_logistics')) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 py-20">
        <div className="w-20 h-20 bg-surface-2 border border-border/50 rounded-full flex items-center justify-center shadow-lg">
          <Icon name="lock" size={32} style={{ color: 'var(--pm-on-surface-variant)', opacity: 0.5 }} />
        </div>
        <div className="text-center max-w-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-signal-error mb-2">
            Access Denied
          </p>
          <p className="text-sm font-medium text-text-tertiary">Team management privileges are strictly required to access this section.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between px-6 md:px-10 pt-8 pb-4 border-b border-border/40">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <Icon name="local_shipping" size={20} style={{ color: 'rgb(129, 140, 248)' }} />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-text-primary">Team Management</h1>
          </div>
          <p className="text-sm font-medium text-text-tertiary">
            Resource management, attendance tracking, and capacity planning.
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/5 border border-indigo-500/20 shadow-sm backdrop-blur-md">
          <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">
            System Online
          </span>
        </div>
      </div>

      {/* Logistics Dashboard */}
      <div className="px-6 md:px-10">
        <LogisticsDashboard
          profiles={profiles}
          teams={teams}
          projects={projects}
          tasks={tasks}
          updateTask={updateTask}
          systemData={systemData}
          onSaveData={handleSaveLogisticsData}
          role={profile?.role}
          defaultTab={window.location.pathname.includes('attendance') ? 'attendance' : window.location.pathname.includes('payroll') ? 'payroll' : 'members'}
        />
      </div>
    </div>
  );
}
