import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, RefreshCw, History, Plus, X, Globe, Building2, CalendarDays } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { holidaySourceService } from '../../services/holidaySourceService';
import { supabase } from '../../lib/supabase';
import type { SyncLogEntry } from '../../services/holidaySourceService';
import { hasCapability } from '../../core/auth/permissions';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_HEADERS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const COMPANY_EVENT_TYPES = [
  { value: 'company', label: 'Company Retreat' },
  { value: 'company', label: 'Emergency Closure' },
  { value: 'company', label: 'Strike' },
  { value: 'company', label: 'Maintenance Day' },
  { value: 'company', label: 'Special Holiday' },
  { value: 'company', label: 'Flood Closure' },
  { value: 'company', label: 'Election Day' },
];

export function CalendarIntelligencePanel() {
  const { workspace } = useWorkspace();
  const { profile } = useAuth();
  const canManageCalendar = hasCapability(profile?.role, 'manage_settings');
  const [tab, setTab] = useState<'calendar' | 'history'>('calendar');
  const [year, setYear] = useState(new Date().getFullYear());
  const [events, setEvents] = useState<any[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', start_date: '', end_date: '', event_type: 'company' as const, capacity_impact: 1, description: '' });
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [isGoogleOAuthEnabled, setIsGoogleOAuthEnabled] = useState(true);

  const loadData = async () => {
    if (!workspace?.id) return;
    const [evts, logs] = await Promise.all([
      holidaySourceService.getCalendarEvents(workspace.id, year),
      holidaySourceService.getSyncLogs(workspace.id)
    ]);
    setEvents(evts);
    setSyncLogs(logs);
    try {
      const { calendarService } = await import('../../services/calendarService');
      const config = await calendarService.getConfig();
      setIsGoogleOAuthEnabled(config.googleOAuthEnabled);
    } catch (e) {}
  };

  useEffect(() => {
    loadData();
  }, [workspace?.id, year]);

  const handleSyncNow = async () => {
    if (!workspace?.id || !workspace.settings.country || syncing) return;
    setSyncing(true);
    setLastSyncResult(null);
    try {
      const result = await holidaySourceService.syncForWorkspace(
        workspace.id, workspace.settings.country, workspace.settings.region || '', workspace.ownerId
      );
      setLastSyncResult(
        `Sync complete: ${result.imported} new, ${result.skipped} unchanged (${result.status})`,
      );
      await loadData();
    } catch (err: any) {
      setLastSyncResult(`Sync failed: ${err?.message || 'Unknown error'}`);
    } finally { setSyncing(false); }
  };

  const handleToggle = async (eventId: string, currentlyDeleted: string | null) => {
    if (!canManageCalendar || togglingIds.has(eventId)) return;
    setTogglingIds(prev => new Set(prev).add(eventId));
    const enabled = !!currentlyDeleted;
    await holidaySourceService.toggleHoliday(eventId, workspace!.id, enabled);
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, deleted_at: enabled ? null : new Date().toISOString() } : e));
    setTogglingIds(prev => { const n = new Set(prev); n.delete(eventId); return n; });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eta-recalculate'));
    }
  };

  const handleCreateEvent = async () => {
    if (!workspace?.id || !newEvent.title || !newEvent.start_date) return;
    const ok = await holidaySourceService.createOrganizationEvent(workspace.id, {
      title: newEvent.title,
      start_date: `${newEvent.start_date}T00:00:00Z`,
      end_date: `${newEvent.end_date || newEvent.start_date}T23:59:59Z`,
      event_type: 'company',
      capacity_impact: newEvent.capacity_impact,
      description: newEvent.description || undefined,
    }, workspace.ownerId);
    if (ok) {
      setShowCreateForm(false);
      setNewEvent({ title: '', start_date: '', end_date: '', event_type: 'company', capacity_impact: 1, description: '' });
      await loadData();
    }
  };

  const calendarGrid = useMemo(() => {
    const weeks: Array<Array<{ day: number; events: any[] } | null>> = [];
    for (let m = 0; m < 12; m++) {
      const firstDay = new Date(year, m, 1);
      const daysInMonth = new Date(year, m + 1, 0).getDate();
      const startOffset = (firstDay.getDay() + 6) % 7;
      const days: Array<{ day: number; events: any[] } | null> = [];
      for (let i = 0; i < startOffset; i++) days.push(null);
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayEvents = events.filter(e => {
          const start = e.start_date?.split('T')[0] || '';
          const end = e.end_date?.split('T')[0] || start;
          return dateStr >= start && dateStr <= end;
        });
        days.push({ day: d, events: dayEvents });
      }
      weeks.push(days);
    }
    return weeks;
  }, [year, events]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-text-primary mb-1">Calendar Intelligence</h2>
          <p className="text-[12px] text-text-tertiary font-medium">
            {canManageCalendar ? 'Orchestrate organization-wide holidays, company events, and synchronization logic.' : 'Regional and company event schedule visibility.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isGoogleOAuthEnabled && (
            <button
              onClick={async () => {
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;
                window.open(`${import.meta.env.VITE_CALENDAR_API_URL}/auth/google?token=${token}`, '_blank', 'width=600,height=700');
              }}
              className="px-4 py-2 bg-[#4285F4] hover:bg-[#3367D6] text-[var(--pm-text)] dark:text-white rounded-lg text-[12px] font-semibold shadow-sm transition-all flex items-center gap-2"
            >
              <CalendarDays className="w-4 h-4" /> Connect Google Calendar
            </button>
          )}
          {canManageCalendar && (
            <button 
              onClick={() => setShowCreateForm(true)} 
              className="px-4 py-2 bg-accent-primary hover:bg-accent-primary/90 text-[var(--pm-text)] dark:text-white rounded-lg text-[12px] font-semibold shadow-sm transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Event
            </button>
          )}
          <div className="flex items-center bg-surface-2 border border-border rounded-lg p-1 shadow-sm">
            <button onClick={() => setYear(y => y - 1)} className="p-1.5 hover:bg-surface-3 rounded-md transition-colors text-text-tertiary"><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-4 text-[13px] font-bold text-text-primary">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="p-1.5 hover:bg-surface-3 rounded-md transition-colors text-text-tertiary"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border-subtle mb-8">
        <button 
          onClick={() => setTab('calendar')} 
          className={`px-5 py-3 text-[12px] font-bold uppercase tracking-wider transition-all border-b-2 ${
            tab === 'calendar' ? 'border-accent-primary text-text-primary bg-accent-primary/5' : 'border-transparent text-text-tertiary hover:text-text-secondary'
          }`}
        >
          Calendar View
        </button>
        <button 
          onClick={() => setTab('history')} 
          className={`px-5 py-3 text-[12px] font-bold uppercase tracking-wider transition-all border-b-2 ${
            tab === 'history' ? 'border-accent-primary text-text-primary bg-accent-primary/5' : 'border-transparent text-text-tertiary hover:text-text-secondary'
          }`}
        >
          Sync History
        </button>
      </div>

      {tab === 'calendar' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {calendarGrid.map((monthDays, mi) => (
              <div key={mi} className="bg-surface-2 border border-border rounded-xl p-4 shadow-sm hover:border-accent-primary/20 transition-all">
                <h4 className="text-[12px] font-bold uppercase tracking-widest text-accent-primary mb-4">{MONTHS[mi]}</h4>
                <div className="grid grid-cols-7 gap-1">
                  {DAY_HEADERS.map(d => <div key={d} className="text-[10px] font-bold text-text-quaternary text-center py-1">{d}</div>)}
                  {monthDays.map((cell, ci) => (
                    <div key={ci} className="aspect-square flex items-center justify-center text-[11px] font-bold relative group">
                      {cell && (
                        <div className={`w-full h-full flex items-center justify-center rounded-lg transition-all ${
                          cell.events.length > 0 ? 'bg-accent-primary text-[var(--pm-text)] dark:text-white shadow-sm' : 'text-text-tertiary hover:bg-surface-3 hover:text-text-primary'
                        }`}>
                          {cell.day}
                        </div>
                      )}
                      {cell && cell.events.length > 0 && (
                        <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 pb-2 hidden group-hover:block w-56">
                          <div className="bg-surface border border-border rounded-xl shadow-2xl p-3 overflow-hidden">
                            <div className="max-h-48 overflow-y-auto scrollbar-thin space-y-2">
                              {cell.events.map((ev: any) => {
                                const isDeleted = !!ev.deleted_at;
                                return (
                                  <div key={ev.id} className={`flex flex-col gap-1 p-2 rounded-lg ${isDeleted ? 'bg-bg/50 opacity-40' : 'bg-surface-2 border border-border-subtle'}`}>
                                    <div className="flex items-center gap-2">
                                      {ev.auto_generated ? <Globe className="w-3.5 h-3.5 text-accent-primary" /> : <Building2 className="w-3.5 h-3.5 text-signal-warning" />}
                                      <span className="text-[11px] font-bold text-text-primary truncate">{ev.title}</span>
                                    </div>
                                    {canManageCalendar && (
                                      <button
                                        onClick={() => handleToggle(ev.id, ev.deleted_at)}
                                        disabled={togglingIds.has(ev.id)}
                                        className={`mt-1 w-full py-1 text-[9px] font-bold uppercase tracking-wider rounded border transition-all ${
                                          isDeleted 
                                            ? 'border-signal-safe/30 text-signal-safe hover:bg-signal-safe/10' 
                                            : 'border-signal-critical/30 text-signal-critical hover:bg-signal-critical/10'
                                        }`}
                                      >
                                        {togglingIds.has(ev.id) ? 'Processing...' : isDeleted ? 'Re-enable Event' : 'Disable Event'}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-surface-2 border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center">
                  <RefreshCw className={`w-4 h-4 text-accent-primary ${syncing ? 'animate-spin' : ''}`} />
                </div>
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Calendar Sync</h3>
              </div>
              <button 
                onClick={handleSyncNow} 
                disabled={syncing || !workspace?.settings?.country} 
                className="px-5 py-2 bg-[var(--pm-inverse-surface)] text-[var(--pm-inverse-on-surface)] rounded-lg text-[12px] font-bold hover:opacity-90 transition-all uppercase tracking-widest disabled:opacity-50"
              >
                {syncing ? 'Syncing Pipeline...' : 'Force Global Sync'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
              <div className="p-4 bg-surface rounded-lg border border-border-subtle">
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest block mb-1">Target Country</span>
                <p className="text-[13px] font-bold text-text-primary">{workspace?.settings?.country || 'Unconfigured'}</p>
              </div>
              <div className="p-4 bg-surface rounded-lg border border-border-subtle">
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest block mb-1">Active Region</span>
                <p className="text-[13px] font-bold text-text-primary">{workspace?.settings?.region || 'National'}</p>
              </div>
              <div className="p-4 bg-surface rounded-lg border border-border-subtle">
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest block mb-1">Auto-Ingested</span>
                <p className="text-[13px] font-bold text-signal-safe">{events.filter(e => e.auto_generated && !e.deleted_at).length} Events</p>
              </div>
              <div className="p-4 bg-surface rounded-lg border border-border-subtle">
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest block mb-1">Operational Override</span>
                <p className="text-[13px] font-bold text-signal-warning">{events.filter(e => !e.auto_generated && !e.deleted_at).length} Events</p>
              </div>
            </div>
            {lastSyncResult && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }}
                className={`mt-6 p-4 rounded-lg text-[12px] font-bold border ${
                  lastSyncResult.includes('failed') ? 'bg-signal-critical-bg border-signal-critical/20 text-signal-critical' : 'bg-signal-safe-bg border-signal-safe/20 text-signal-safe'
                }`}
              >
                {lastSyncResult}
              </motion.div>
            )}
          </div>
        </div>
      )}

          {showCreateForm && canManageCalendar && (
            <div className="fixed inset-0 bg-bg backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreateForm(false)}>
              <div className="bg-surface border border-border w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-sans tracking-tight uppercase tracking-wide">Create Organization Event</h3>
                  <button onClick={() => setShowCreateForm(false)}><X className="w-4 h-4 text-text-tertiary hover:text-text-primary" /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-mono uppercase text-text-tertiary mb-1 block">Title</label>
                    <input value={newEvent.title} onChange={e => setNewEvent(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g. Company Retreat, Flood Closure" className="w-full h-10 bg-bg border border-border px-3 text-xs font-mono text-text-primary outline-none focus:border-white/40" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-text-tertiary mb-1 block">Start Date</label>
                      <input type="date" value={newEvent.start_date} onChange={e => setNewEvent(prev => ({ ...prev, start_date: e.target.value }))} className="w-full h-10 bg-bg border border-border px-3 text-xs font-mono text-text-primary outline-none focus:border-white/40" />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-text-tertiary mb-1 block">End Date</label>
                      <input type="date" value={newEvent.end_date} onChange={e => setNewEvent(prev => ({ ...prev, end_date: e.target.value }))} className="w-full h-10 bg-bg border border-border px-3 text-xs font-mono text-text-primary outline-none focus:border-white/40" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 py-2">
                    <input 
                      type="checkbox" 
                      id="isLeave" 
                      checked={newEvent.capacity_impact === 1}
                      onChange={e => setNewEvent(prev => ({ ...prev, capacity_impact: e.target.checked ? 1 : 0 }))}
                      className="w-4 h-4 rounded border-border bg-bg text-accent-primary focus:ring-accent-primary"
                    />
                    <label htmlFor="isLeave" className="text-xs font-mono text-text-primary cursor-pointer">
                      Mark as non-working day (Leave/Off)
                    </label>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase text-text-tertiary mb-1 block">Description</label>
                    <textarea value={newEvent.description} onChange={e => setNewEvent(prev => ({ ...prev, description: e.target.value }))} rows={2} className="w-full bg-bg border border-border px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-white/40" />
                  </div>
                  <button onClick={handleCreateEvent} disabled={!newEvent.title || !newEvent.start_date} className="w-full bg-[var(--pm-surface)] text-[var(--pm-text)] h-10 font-semibold hover:bg-neutral-200 transition-colors uppercase text-xs tracking-wide disabled:opacity-50">
                    Create Event
                  </button>
                </div>
              </div>
            </div>
          )}
      {tab === 'history' && (
        <div className="border border-border bg-surface p-6">
          <h3 className="text-sm font-sans tracking-tight uppercase tracking-wide mb-4 flex items-center gap-2">
            <History className="w-4 h-4" /> Sync History ({syncLogs.length})
          </h3>
          <div>
            <table className="w-full text-left border-collapse ">
              <thead>
                <tr className="bg-[var(--pm-surface)]/5 border-b border-border">
                  <th className="px-4 py-3 text-[9px] font-mono uppercase tracking-wide text-text-tertiary">Date</th>
                  <th className="px-4 py-3 text-[9px] font-mono uppercase tracking-wide text-text-tertiary">Provider</th>
                  <th className="px-4 py-3 text-[9px] font-mono uppercase tracking-wide text-text-tertiary">Country</th>
                  <th className="px-4 py-3 text-[9px] font-mono uppercase tracking-wide text-text-tertiary">Year</th>
                  <th className="px-4 py-3 text-[9px] font-mono uppercase tracking-wide text-text-tertiary">Found</th>
                  <th className="px-4 py-3 text-[9px] font-mono uppercase tracking-wide text-text-tertiary">Imported</th>
                  <th className="px-4 py-3 text-[9px] font-mono uppercase tracking-wide text-text-tertiary">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {syncLogs.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-xs font-mono text-text-quaternary italic">No sync logs yet.</td></tr>}
                {syncLogs.map(log => (
                  <tr key={log.id} className="hover:bg-surface-3">
                    <td className="px-4 py-3 text-[10px] font-mono text-text-secondary">{log.created_at ? new Date(log.created_at).toLocaleDateString() : '-'}</td>
                    <td className="px-4 py-3 text-[10px] font-mono text-text-secondary">{log.provider}</td>
                    <td className="px-4 py-3 text-[10px] font-mono text-text-secondary">{log.country}{log.region ? `/ ${log.region}` : ''}</td>
                    <td className="px-4 py-3 text-[10px] font-mono text-text-tertiary">{log.year}</td>
                    <td className="px-4 py-3 text-[10px] font-mono text-text-secondary">{log.holidays_found}</td>
                    <td className="px-4 py-3 text-[10px] font-mono text-text-secondary">{log.holidays_imported}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[9px] font-mono uppercase px-2 py-0.5 border ${log.status === 'success' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' : log.status === 'partial' ? 'border-border text-signal-warning bg-signal-warning-bg' : log.status === 'failed' ? 'border-red-500/30 text-signal-critical bg-signal-critical-bg' : 'border-border text-text-tertiary bg-[var(--pm-surface)]/5'}`}>{log.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
