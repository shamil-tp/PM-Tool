import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../context/DashboardContext';
import { Clock, Calendar, Users, Search, CheckCircle, XCircle } from 'lucide-react';
import { getLocalDateString } from '../../utils/timeUtils';

export function WorkLogsPanel() {
  const { profile } = useAuth();
  const { profiles, tasks, projects } = useDashboard();
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());
  const [search, setSearch] = useState('');

  const logs = useMemo(() => {
    const completed = tasks.filter((t: any) => t.status === 'done' && t.updated_at);
    const byProfile = profiles.map((p: any) => {
      const assigned = tasks.filter((t: any) => t.assignee_id === p.id);
      const completedToday = assigned.filter((t: any) => t.status === 'done' && t.updated_at?.startsWith(selectedDate));
      const inProgress = assigned.filter((t: any) => t.status === 'in_progress');
      const totalHrs = assigned.reduce((s: number, t: any) => s + (t.estimated_hours || 0), 0);
      return { profile: p, completedToday: completedToday.length, inProgress: inProgress.length, totalTasks: assigned.length, totalHours: totalHrs };
    });
    return byProfile;
  }, [tasks, profiles, selectedDate]);

  const filtered = useMemo(() => {
    if (!search) return logs;
    const q = search.toLowerCase();
    return logs.filter((l: any) => l.profile.full_name?.toLowerCase().includes(q) || l.profile.email?.toLowerCase().includes(q));
  }, [logs, search]);

  const dayStats = useMemo(() => {
    const totalCompleted = logs.reduce((s: number, l: any) => s + l.completedToday, 0);
    const totalInProgress = logs.reduce((s: number, l: any) => s + l.inProgress, 0);
    const totalHours = logs.reduce((s: number, l: any) => s + l.totalHours, 0);
    return { totalCompleted, totalInProgress, totalHours };
  }, [logs]);

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-6 sm:py-12 space-y-8 font-geist" style={{ color: 'var(--pm-on-surface)' }}>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1" style={{ color: 'var(--pm-on-surface)' }}>Resource Management</h2>
        <p className="text-sm tracking-tight" style={{ color: 'var(--pm-on-surface-variant)' }}>Time tracking, attendance, and productivity analytics</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-center glass-panel rounded-xl p-6">
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-mono-pm uppercase tracking-widest" style={{ color: 'var(--pm-on-surface-variant)' }}>Date</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--pm-on-surface-variant)' }} />
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full h-11 pl-10 pr-4 text-sm font-mono-pm rounded-lg outline-none transition-colors"
              style={{ background: 'var(--pm-surface-high)', color: 'var(--pm-on-surface)', border: '1px solid rgba(70,69,84,0.3)' }} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-mono-pm uppercase tracking-widest" style={{ color: 'var(--pm-on-surface-variant)' }}>Search Profile</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--pm-on-surface-variant)' }} />
            <input type="text" placeholder="Name or email..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-4 text-sm font-mono-pm rounded-lg outline-none transition-colors placeholder:opacity-50"
              style={{ background: 'var(--pm-surface-high)', color: 'var(--pm-on-surface)', border: '1px solid rgba(70,69,84,0.3)' }} />
          </div>
        </div>
        <div className="text-center border-t lg:border-t-0 lg:border-l pt-4 lg:pt-0 lg:pl-6" style={{ borderColor: 'rgba(70,69,84,0.2)' }}>
          <p className="text-[9px] font-mono-pm uppercase tracking-widest mb-1" style={{ color: 'var(--pm-on-surface-variant)' }}>Completed Today</p>
          <p className="text-2xl font-bold tracking-tight" style={{ color: '#34d399' }}>{dayStats.totalCompleted}</p>
        </div>
        <div className="text-center border-t lg:border-t-0 lg:border-l pt-4 lg:pt-0 lg:pl-6" style={{ borderColor: 'rgba(70,69,84,0.2)' }}>
          <p className="text-[9px] font-mono-pm uppercase tracking-widest mb-1" style={{ color: 'var(--pm-on-surface-variant)' }}>In Progress</p>
          <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--pm-tertiary)' }}>{dayStats.totalInProgress}</p>
        </div>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="p-6 border-b flex justify-between items-center" style={{ borderColor: 'rgba(70,69,84,0.3)', background: 'var(--pm-surface-highest)' }}>
          <h3 className="text-sm font-semibold tracking-tight">Daily Productivity Log</h3>
          <span className="text-[10px] font-mono-pm uppercase tracking-widest" style={{ color: 'var(--pm-on-surface-variant)' }}>{selectedDate}</span>
        </div>
        <div className="divide-y" style={{ borderColor: 'rgba(70,69,84,0.15)' }}>
          {filtered.map((entry: any) => (
            <div key={entry.profile.id} className="p-6 flex items-center justify-between transition-colors hover:bg-[var(--pm-surface)]/5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden" style={{ background: 'var(--pm-surface-high)', border: '1px solid rgba(70,69,84,0.3)' }}>
                  {entry.profile.avatar_url ? (
                    <img src={entry.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Users className="w-5 h-5" style={{ color: 'var(--pm-on-surface-variant)' }} />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--pm-on-surface)' }}>{entry.profile.full_name || 'Anonymous'}</p>
                  <p className="text-[10px] font-mono-pm uppercase" style={{ color: 'var(--pm-on-surface-variant)' }}>{entry.profile.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2" style={{ color: '#34d399' }}>
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-mono-pm uppercase tracking-widest">{entry.completedToday} done</span>
                </div>
                <div className="flex items-center gap-2" style={{ color: 'var(--pm-tertiary)' }}>
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-mono-pm uppercase tracking-widest">{entry.inProgress} active</span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-mono-pm uppercase tracking-widest" style={{ color: 'var(--pm-on-surface)' }}>{entry.totalHours}h total</p>
                  <p className="text-[9px] font-mono-pm uppercase tracking-widest" style={{ color: 'var(--pm-on-surface-variant)' }}>{entry.totalTasks} tasks assigned</p>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="p-12 text-center text-xs font-mono-pm uppercase tracking-widest" style={{ color: 'var(--pm-on-surface-variant)' }}>
              No work logs for this date.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
