import React, { useMemo, useState, useEffect } from 'react';
import { Check, Plus, X, Layers, GitBranch, Users, Hash, BadgeCheck, CalendarDays } from 'lucide-react';
import { BUSINESS_TYPES, WORKFLOW_TEMPLATES, getTemplatesForBusiness, EXECUTION_MODES } from '../../constants/product';
import type { WorkflowTemplate } from '../../constants/product';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { predictEtaSync } from '../../services/etaService';
import { holidaySourceService } from '../../services/holidaySourceService';
import type { BusinessType, WorkspaceSettings } from '../../types/workspace';
import { ResolveLayout } from '../../app/layouts/ResolveLayout';
import { supabase } from '../../lib/supabase';
import { COUNTRIES, getCountryByCode } from '../../data/countries';
import type { DerivedHoliday } from '../../utils/holidays';

const WORKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' }
];

const DEFAULT_SETTINGS: WorkspaceSettings = {
  businessType: 'Software',
  workStart: '09:00',
  workEnd: '17:00',
  lunchDuration: 60,
  workingDays: [1, 2, 3, 4, 5],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  attendanceEnabled: true,
  payrollEnabled: false,
  productivityFactor: 0.8,
  saturdayRule: 'off'
};

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function WorkspaceSetupPage() {
  const { user, workspace, createWorkspace, updateWorkspaceSettings, error } = useWorkspace();
  const { refreshProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [workspaceName, setWorkspaceName] = useState(workspace?.name || '');
  const [settings, setSettings] = useState<WorkspaceSettings>(workspace?.settings || DEFAULT_SETTINGS);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteDoj, setInviteDoj] = useState(new Date().toISOString().split('T')[0]);
  const [invites, setInvites] = useState<{email: string, doj: string}[]>([]);
  const [previewHolidays, setPreviewHolidays] = useState<DerivedHoliday[]>([]);
  const [ignoredHolidayDates, setIgnoredHolidayDates] = useState<Set<string>>(new Set());
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (window.location.pathname !== '/onboarding/workspace') {
      window.history.replaceState(null, '', '/onboarding/workspace');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, []);

  useEffect(() => {
    if (step === 4 && settings.country && previewHolidays.length === 0 && !previewLoading) {
      setPreviewLoading(true);
      const year = new Date().getFullYear();
      Promise.all([
        holidaySourceService.fetchHolidays(settings.country, settings.region || '', year),
        holidaySourceService.fetchHolidays(settings.country, settings.region || '', year + 1)
      ]).then(([thisYear, nextYear]) => {
        setPreviewHolidays([...thisYear, ...nextYear]);
      }).catch(() => {
        setPreviewHolidays([]);
      }).finally(() => {
        setPreviewLoading(false);
      });
    }
  }, [step, settings.country, settings.region]);

  const templateOptions = useMemo(() => getTemplatesForBusiness(settings.businessType), [settings.businessType]);

  const preview = useMemo(() => predictEtaSync({
    likely: 40,
    workWindow: settings,
    startDate: new Date()
  }), [settings]);

  const saveWorkspace = async () => {
    setSaving(true);
    setLocalError(null);

    try {
      let wsId = workspace?.id;
      if (workspace) {
        await updateWorkspaceSettings(settings);
        wsId = workspace.id;
      } else {
        const created = await createWorkspace({
          name: workspaceName.trim() || 'Resolve Workspace',
          settings: { ...settings, companyName: workspaceName.trim() || 'Resolve Workspace' },
          templateId: selectedTemplate?.id,
          executionMode: selectedTemplate?.executionMode,
          defaultLanes: selectedTemplate?.lanes,
          workflowRules: {
            ceremonies: selectedTemplate?.ceremonies || [],
            teamStructure: selectedTemplate?.teamStructure || ''
          }
        });
        wsId = created.id;
        await refreshProfile();
      }

      if (ignoredHolidayDates.size > 0 && wsId) {
        const ignoreList = Array.from(ignoredHolidayDates);
        const { data: toRemove } = await supabase
          .from('calendar_events')
          .select('id')
          .eq('workspace_id', wsId)
          .in('event_type', ['holiday', 'festival'])
          .eq('auto_generated', true)
          .is('deleted_at', null);
        if (toRemove) {
          const idsToRemove = toRemove.filter(e => {
            const d = (e as any).start_date?.split('T')[0] || '';
            return ignoreList.includes(d);
          }).map(e => e.id);
          if (idsToRemove.length > 0) {
            await supabase.from('calendar_events')
              .update({ deleted_at: new Date().toISOString() })
              .in('id', idsToRemove);
          }
        }
      }

      setStep(6);
    } catch (err: any) {
      setLocalError(err?.message || 'Workspace setup failed.');
    } finally {
      setSaving(false);
    }
  };

  const addInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || invites.some(i => i.email === email)) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLocalError("Invalid email format.");
      return;
    }

    setLocalError(null);
    setSaving(true);
    try {
      if (workspace?.id) {
        const { error: inviteError } = await supabase
          .from('invitations')
          .insert({
            email,
            workspace_id: workspace.id,
            role: 'developer', // Default invited role
            status: 'pending',
            invited_by: user?.id,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            date_of_joining: new Date(inviteDoj).toISOString()
          });

        if (inviteError) {
          if (inviteError.code === '23505') {
            throw new Error("This email is already invited.");
          }
          throw inviteError;
        }
      }
      setInvites(prev => [...prev, { email, doj: inviteDoj }]);
      setInviteEmail('');
      setInviteDoj(new Date().toISOString().split('T')[0]);
    } catch (err: any) {
      setLocalError(err?.message || "Failed to save invitation.");
    } finally {
      setSaving(false);
    }
  };

  const removeInvite = async (email: string) => {
    setLocalError(null);
    setSaving(true);
    try {
      if (workspace?.id) {
        await supabase
          .from('invitations')
          .delete()
          .eq('workspace_id', workspace.id)
          .eq('email', email);
      }
      setInvites(prev => prev.filter(value => value.email !== email));
    } catch (err: any) {
      setLocalError("Failed to revoke invitation.");
    } finally {
      setSaving(false);
    }
  };

  const toggleWorkday = (day: number) => {
    setSettings(prev => {
      const nextDays = prev.workingDays.includes(day)
        ? prev.workingDays.filter(value => value !== day)
        : [...prev.workingDays, day].sort((a, b) => a - b);

      const hasSaturday = nextDays.includes(6);
      return {
        ...prev,
        workingDays: nextDays.length > 0 ? nextDays : prev.workingDays,
        saturdayRule: hasSaturday ? (prev.saturdayRule === 'off' ? 'all' : prev.saturdayRule || 'all') : 'off'
      };
    });
  };

  return (
    <ResolveLayout eyebrow="Workspace Initialization">
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Main Form Section */}
        <section 
          className="bg-surface-3/50 backdrop-blur-md border border-border/50 rounded-2xl p-8 shadow-sm animate-in fade-in slide-in-from-bottom-3 duration-300 font-geist"
          style={{ color: 'var(--pm-on-surface)' }}
        >
          <div className="mb-8 flex items-center justify-between border-b pb-5" style={{ borderColor: 'rgba(70,69,84,0.15)' }}>
            <div>
              <p className="text-[10px] font-mono-pm uppercase tracking-[0.25em]" style={{ color: 'var(--pm-on-surface-variant)' }}>Initialization Phase {step} of 7</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: 'var(--pm-on-surface)' }}>
                {step <= 5 ? 'Configure Workspace Environment' : step === 6 ? 'Assemble Unit Members' : 'Workspace Foundations Complete'}
              </h2>
            </div>
          </div>

          {(localError || error) && (
            <div className="mb-6 border border-red-500/20 bg-signal-critical-bg/30 p-4 text-xs font-mono-pm text-red-200 rounded-lg flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span>{localError || error}</span>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <label className="block text-xs uppercase font-mono-pm tracking-widest mb-1" style={{ color: 'var(--pm-on-surface-variant)' }}>
                Organization Identity (Company Name) <span className="text-signal-critical">*</span>
                <input
                  value={workspaceName}
                  onChange={event => {
                    setWorkspaceName(event.target.value);
                    setSettings(prev => ({ ...prev, companyName: event.target.value }));
                  }}
                  className="mt-2.5 h-11 w-full bg-surface-3 border border-border/50 rounded-lg px-4 text-sm outline-none transition-all font-sans focus:border-accent-primary focus:bg-surface-4"
                  style={{ color: 'var(--pm-on-surface)' }}
                  placeholder="e.g. Acme Corp"
                />
              </label>

              <div>
                <label className="mb-3 block text-xs uppercase font-mono-pm tracking-widest" style={{ color: 'var(--pm-on-surface-variant)' }}>Operational Domain</label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {BUSINESS_TYPES.map(type => (
                    <button
                      key={type}
                      onClick={() => setSettings(prev => ({ ...prev, businessType: type as BusinessType }))}
                      className={`border border-border/50 rounded-xl px-4 py-3.5 text-left text-xs transition-all font-sans`}
                      style={{ 
                        borderColor: settings.businessType === type ? 'var(--accent-primary)' : 'rgba(70,69,84,0.2)',
                        background: settings.businessType === type ? 'rgba(var(--accent-primary-rgb), 0.1)' : 'var(--pm-surface-lowest)',
                        color: settings.businessType === type ? 'var(--accent-primary)' : 'var(--pm-on-surface)'
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${settings.businessType === type ? 'bg-[var(--pm-primary)]' : 'bg-[var(--pm-on-surface-variant)]'}`} />
                        <span className="font-semibold">{type}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <label className="block text-xs uppercase font-mono-pm tracking-widest mb-1" style={{ color: 'var(--pm-on-surface-variant)' }}>
                Regional Jurisdiction <span className="text-signal-critical">*</span>
                <select
                  value={settings.country || ''}
                  onChange={event => {
                    setSettings(prev => ({ ...prev, country: event.target.value, region: '' }));
                    setIgnoredHolidayDates(new Set());
                    setPreviewHolidays([]);
                  }}
                  className="mt-2.5 h-11 w-full bg-surface-3 border border-border/50 rounded-lg px-4 text-sm outline-none transition-all font-sans focus:border-accent-primary focus:bg-surface-4"
                  style={{ color: 'var(--pm-on-surface)' }}
                >
                  <option value="">Select country</option>
                  {COUNTRIES.map(c => (
                    <option key={c.code} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--pm-on-surface-variant)] leading-relaxed mb-4">
                Select a baseline workflow architecture optimized for <strong>{settings.businessType}</strong>. This instantiates your primary kanban/scrum execution structures.
              </p>
              <div className="grid gap-3.5 max-h-[440px] overflow-y-auto pr-1 scrollbar-thin">
                {templateOptions.map(tpl => {
                  const isSelected = selectedTemplate?.id === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => {
                        setSelectedTemplate(tpl);
                        setSettings(prev => ({
                          ...prev,
                          templateId: tpl.id,
                          executionMode: tpl.executionMode,
                          defaultLanes: tpl.lanes,
                          workflowRules: { ceremonies: tpl.ceremonies, teamStructure: tpl.teamStructure }
                        }));
                      }}
                      className={`w-full text-left border rounded-2xl p-5 transition-all shadow-sm hover:shadow-md ${isSelected ? 'border-accent-primary bg-accent-primary/5' : 'bg-surface-3 border-border/50 hover:border-accent-primary/30'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold tracking-tight text-[var(--pm-on-surface)]">{tpl.name}</h4>
                          <p className="mt-1.5 text-xs text-[var(--pm-on-surface-variant)] leading-relaxed">{tpl.description}</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider border px-2 py-0.5 text-[var(--pm-on-surface-variant)] bg-[var(--pm-surface-lowest)]" style={{ borderColor: 'rgba(70,69,84,0.2)' }}>
                              <Layers className="w-3 h-3" />{tpl.lanes} lanes
                            </span>
                            <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider border px-2 py-0.5 text-[var(--pm-on-surface-variant)] bg-[var(--pm-surface-lowest)]" style={{ borderColor: 'rgba(70,69,84,0.2)' }}>
                              <GitBranch className="w-3 h-3" />{tpl.executionMode}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider border px-2 py-0.5 text-[var(--pm-on-surface-variant)] bg-[var(--pm-surface-lowest)]" style={{ borderColor: 'rgba(70,69,84,0.2)' }}>
                              <Users className="w-3 h-3" />{tpl.teamStructure}
                            </span>
                          </div>
                          {tpl.ceremonies.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1">
                              {tpl.ceremonies.map(c => (
                                <span key={c} className="text-[8px] font-mono bg-[var(--pm-surface)]/5 px-2 py-0.5 rounded text-accent-secondary/70">{c}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {isSelected && <BadgeCheck className="w-5 h-5 text-[var(--pm-primary)] shrink-0 mt-0.5" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="text-xs uppercase font-mono-pm tracking-widest text-[var(--pm-on-surface-variant)]">
                Shift Commencement
                <input type="time" value={settings.workStart} onChange={event => setSettings(prev => ({ ...prev, workStart: event.target.value }))} className="mt-2 h-11 w-full border border-border/50 rounded-lg bg-surface-3 px-4 text-sm text-[var(--pm-on-surface)] focus:border-accent-primary focus:bg-surface-4 outline-none transition-all font-sans" />
              </label>
              <label className="text-xs uppercase font-mono-pm tracking-widest text-[var(--pm-on-surface-variant)]">
                Shift Conclusion
                <input type="time" value={settings.workEnd} onChange={event => setSettings(prev => ({ ...prev, workEnd: event.target.value }))} className="mt-2 h-11 w-full border border-border/50 rounded-lg bg-surface-3 px-4 text-sm text-[var(--pm-on-surface)] focus:border-accent-primary focus:bg-surface-4 outline-none transition-all font-sans" />
              </label>
              <label className="text-xs uppercase font-mono-pm tracking-widest text-[var(--pm-on-surface-variant)]">
                Break Duration (Min)
                <input type="number" min={0} value={settings.lunchDuration} onChange={event => setSettings(prev => ({ ...prev, lunchDuration: Number(event.target.value) || 0 }))} className="mt-2 h-11 w-full border border-border/50 rounded-lg bg-surface-3 px-4 text-sm text-[var(--pm-on-surface)] focus:border-accent-primary focus:bg-surface-4 outline-none transition-all font-sans" />
              </label>
              <label className="text-xs uppercase font-mono-pm tracking-widest text-[var(--pm-on-surface-variant)]">
                Timezone Calibration
                <input value={settings.timezone} onChange={event => setSettings(prev => ({ ...prev, timezone: event.target.value }))} className="mt-2 h-11 w-full border border-border/50 rounded-lg bg-surface-3 px-4 text-sm text-[var(--pm-on-surface)] focus:border-accent-primary focus:bg-surface-4 outline-none transition-all font-sans" />
              </label>
              {(() => {
                const countryData = getCountryByCode(settings.country || '');
                return countryData && countryData.states.length > 0 ? (
                  <label className="text-xs uppercase font-mono-pm tracking-widest text-[var(--pm-on-surface-variant)]">
                    State/Region
                    <select
                      value={settings.region || ''}
                      onChange={event => setSettings(prev => ({ ...prev, region: event.target.value }))}
                      className="mt-2 h-11 w-full border border-border/50 rounded-lg bg-surface-3 px-4 text-sm text-[var(--pm-on-surface)] outline-none focus:border-accent-primary focus:bg-surface-4 transition-all font-sans"
                    >
                      <option value="">Select state/region</option>
                      {countryData.states.map(s => (
                        <option key={s.code} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="text-xs uppercase font-mono-pm tracking-widest text-[var(--pm-on-surface-variant)]">
                    State/Region
                    <input
                      value={settings.region || ''}
                      onChange={event => setSettings(prev => ({ ...prev, region: event.target.value }))}
                      placeholder="Optional"
                      className="mt-2 h-11 w-full border border-border/50 rounded-lg bg-surface-3 px-4 text-sm text-[var(--pm-on-surface)] focus:border-accent-primary focus:bg-surface-4 outline-none transition-all font-sans"
                    />
                  </label>
                );
              })()}
              <label className="text-xs uppercase font-mono-pm tracking-widest text-[var(--pm-on-surface-variant)]">
                City / Municipality
                <input
                  value={settings.city || ''}
                  onChange={event => setSettings(prev => ({ ...prev, city: event.target.value }))}
                  placeholder="Optional"
                  className="mt-2 h-11 w-full border border-border/50 rounded-lg bg-surface-3 px-4 text-sm text-[var(--pm-on-surface)] focus:border-accent-primary focus:bg-surface-4 outline-none transition-all font-sans"
                />
              </label>
              <div className="sm:col-span-2">
                <label className="mb-3 block text-xs uppercase font-mono-pm tracking-widest text-[var(--pm-on-surface-variant)]">Working Days Checklist</label>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {WORKDAYS.map(day => {
                    const active = settings.workingDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        onClick={() => toggleWorkday(day.value)}
                        className={`h-10 border rounded-lg text-xs transition-all font-mono-pm ${active ? '!border-[var(--pm-primary)] bg-[var(--pm-primary)]/10 text-[var(--pm-on-surface)] shadow-sm' : 'bg-[var(--pm-surface-low)] text-[var(--pm-on-surface-variant)] hover:border-[var(--pm-border)] dark:border-white/20'}`}
                        style={{ borderColor: active ? '' : 'rgba(70,69,84,0.2)' }}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {settings.workingDays.includes(6) && (
                <div className="sm:col-span-2">
                  <label className="mb-3 block text-xs uppercase font-mono-pm tracking-widest text-[var(--pm-on-surface-variant)]">Saturday Coverage Pattern</label>
                  <select
                    value={settings.saturdayRule || 'all'}
                    onChange={event => setSettings(prev => ({ ...prev, saturdayRule: event.target.value as any }))}
                    className="h-11 w-full border border-border/50 rounded-lg bg-surface-3 px-4 text-sm text-[var(--pm-on-surface)] focus:border-accent-primary focus:bg-surface-4 outline-none transition-all font-sans"
                  >
                    <option value="all">All Saturdays Working</option>
                    <option value="off">All Saturdays Off</option>
                    <option value="2nd_4th">2nd & 4th Saturday Off</option>
                    <option value="1st_3rd">1st & 3rd Saturday Off</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <p className="text-xs text-[var(--pm-on-surface-variant)] leading-relaxed mb-4">
                Verify recognized national holidays for <strong>{settings.country}{settings.region ? ` / ${settings.region}` : ''}</strong>. 
                De-select any events that do not apply to your operating cycles.
              </p>

              {previewLoading && (
                <div className="flex items-center gap-3 py-12 text-xs font-mono-pm text-[var(--pm-on-surface-variant)] justify-center">
                  <div className="h-4 w-4 animate-spin rounded-full border border-white/30 border-t-white" />
                  Calibrating holiday registries...
                </div>
              )}

              {!previewLoading && previewHolidays.length === 0 && settings.country && (
                <div className="border border-dashed rounded-xl bg-[var(--pm-surface-low)] p-8 text-center text-xs text-[var(--pm-on-surface-variant)]" style={{ borderColor: 'rgba(70,69,84,0.3)' }}>
                  <CalendarDays className="mx-auto mb-3 h-8 w-8 opacity-40 text-[var(--pm-on-surface-variant)]" />
                  <p className="font-semibold text-[var(--pm-on-surface-variant)]">No Regional Holidays Located</p>
                  <p className="mt-1 text-text-quaternary">Holiday import is empty for this country code.</p>
                </div>
              )}

              {!previewLoading && previewHolidays.length > 0 && (
                <div className="divide-y rounded-xl border max-h-[380px] overflow-y-auto bg-[var(--pm-surface-low)] p-2 scrollbar-thin" style={{ borderColor: 'rgba(70,69,84,0.3)' }}>
                  {previewHolidays.map(h => {
                    const dateStr = h.date;
                    const isIgnored = ignoredHolidayDates.has(dateStr);
                    return (
                      <label key={dateStr} className={`flex items-center gap-3 px-4 py-3 text-xs transition-colors cursor-pointer hover:bg-surface-3 ${isIgnored ? 'opacity-40' : ''}`}>
                        <input
                          type="checkbox"
                          checked={!isIgnored}
                          onChange={() => {
                            setIgnoredHolidayDates(prev => {
                              const next = new Set(prev);
                              if (next.has(dateStr)) next.delete(dateStr);
                              else next.add(dateStr);
                              return next;
                            });
                          }}
                          className="accent-accent-primary h-4 w-4 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-[var(--pm-on-surface)]">{h.name}</span>
                          <span className="ml-2 font-mono text-[10px] text-[var(--pm-on-surface-variant)]">{dateStr}</span>
                        </div>
                        <span className={`text-[8px] font-mono-pm uppercase px-2 py-0.5 border rounded-sm ${h.type === 'public' ? 'border-amber-500/20 text-amber-300 bg-signal-warning-bg' : h.type === 'festival' ? 'border-purple-500/20 text-purple-300 bg-surface-3' : 'border-blue-500/20 text-blue-300 bg-surface-3'}`}>
                          {h.type}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {!settings.country && (
                <div className="border border-dashed rounded-xl bg-[var(--pm-surface-low)] p-8 text-center text-xs text-[var(--pm-on-surface-variant)]" style={{ borderColor: 'rgba(70,69,84,0.3)' }}>
                  <CalendarDays className="mx-auto mb-3 h-8 w-8 opacity-40 text-[var(--pm-on-surface-variant)]" />
                  <p>A country selection in Phase 1 is required to ingest holidays.</p>
                </div>
              )}

              {previewHolidays.length > 0 && (
                <p className="text-[10px] font-mono-pm uppercase text-[var(--pm-on-surface-variant)] mt-2">
                  {previewHolidays.length - ignoredHolidayDates.size} of {previewHolidays.length} holidays set for import.
                </p>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <label className="block text-xs uppercase font-mono-pm tracking-widest text-[var(--pm-on-surface-variant)] mb-1">
                Friction / Productivity Factor (Modifier)
                <input
                  type="number"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={settings.productivityFactor}
                  onChange={event => setSettings(prev => ({ ...prev, productivityFactor: Number(event.target.value) || 0.8 }))}
                  className="mt-2.5 h-11 w-full border border-border/50 rounded-lg bg-surface-3 px-4 text-sm text-[var(--pm-on-surface)] focus:border-accent-primary focus:bg-surface-4 outline-none transition-all font-sans"
                />
              </label>

              <div className="space-y-3.5">
                <label className="flex items-center justify-between border border-border/50 rounded-xl p-4.5 transition-all bg-surface-3">
                  <div>
                    <span className="block text-xs uppercase font-mono-pm tracking-widest text-[var(--pm-on-surface)]">Attendance Tracker</span>
                    <span className="block text-[10px] text-[var(--pm-on-surface-variant)] mt-0.5">Automated logging of developer online sessions</span>
                  </div>
                  <input type="checkbox" className="accent-accent-primary h-4.5 w-4.5 cursor-pointer" checked={settings.attendanceEnabled} onChange={event => setSettings(prev => ({ ...prev, attendanceEnabled: event.target.checked }))} />
                </label>

                <label className="flex items-center justify-between border border-border/50 rounded-xl p-4.5 transition-all bg-surface-3">
                  <div>
                    <span className="block text-xs uppercase font-mono-pm tracking-widest text-[var(--pm-on-surface)]">Payroll Ledger</span>
                    <span className="block text-[10px] text-[var(--pm-on-surface-variant)] mt-0.5">Integrate salary calculations and financial telemetry</span>
                  </div>
                  <input type="checkbox" className="accent-accent-primary h-4.5 w-4.5 cursor-pointer" checked={settings.payrollEnabled} onChange={event => setSettings(prev => ({ ...prev, payrollEnabled: event.target.checked }))} />
                </label>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-5">
              <div className="flex flex-col gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={event => setInviteEmail(event.target.value)}
                  placeholder="teammate@company.com"
                  className="h-11 w-full border border-border/50 rounded-lg bg-surface-3 px-4 text-sm text-[var(--pm-on-surface)] outline-none focus:border-accent-primary focus:bg-surface-4 transition-all font-sans"
                />
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={inviteDoj}
                    onChange={event => setInviteDoj(event.target.value)}
                    className="h-11 flex-1 border border-border/50 rounded-lg bg-surface-3 px-4 text-sm text-[var(--pm-on-surface)] outline-none focus:border-accent-primary focus:bg-surface-4 transition-all font-sans"
                  />
                  <button onClick={addInvite} className="flex h-11 px-4 items-center justify-center rounded-lg bg-text-primary hover:bg-neutral-200 text-bg transition-colors cursor-pointer shadow-sm text-xs font-semibold">
                    <Plus className="h-4.5 w-4.5 mr-1" /> Add
                  </button>
                </div>
              </div>
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin">
                {invites.map(inv => (
                  <div key={inv.email} className="flex items-center justify-between border border-border/50 rounded-lg bg-surface-3 px-4.5 py-3 text-xs font-mono-pm">
                    <div>
                      <span className="block text-[var(--pm-on-surface)] font-medium">{inv.email}</span>
                      <span className="block text-[10px] text-[var(--pm-on-surface-variant)] mt-0.5">DOJ: {inv.doj}</span>
                    </div>
                    <button onClick={() => removeInvite(inv.email)} disabled={saving} className="text-[var(--pm-on-surface-variant)] hover:text-signal-critical transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {invites.length === 0 && <p className="text-xs text-[var(--pm-on-surface-variant)] italic p-1">No invites added yet. You can invite team members later.</p>}
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="border border-border/50 rounded-xl bg-surface-3 p-8 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                <Check className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-[var(--pm-on-surface)]">Workspace Foundations Instantiated</h3>
                <p className="mt-2 text-xs text-[var(--pm-on-surface-variant)] leading-relaxed">
                  Your team orchestration parameters are now saved. You can initialize delivery units, track sprints, and govern tasks.
                </p>
              </div>
              {selectedTemplate && (
                <div className="mt-4 border border-border/50 rounded-xl bg-surface-3/50 p-4 text-left space-y-1.5">
                  <span className="text-[9px] font-mono-pm uppercase tracking-widest text-[var(--pm-primary)]">Workflow Architecture</span>
                  <p className="text-xs font-semibold text-[var(--pm-on-surface)]">{selectedTemplate.name}</p>
                  <p className="text-[10px] font-mono text-[var(--pm-on-surface-variant)]">{selectedTemplate.executionMode} · {selectedTemplate.lanes} Lanes · {selectedTemplate.teamStructure}</p>
                </div>
              )}
            </div>
          )}

          {/* Navigation Controls */}
          <div className="mt-8 flex justify-between border-t pt-5" style={{ borderColor: 'rgba(70,69,84,0.15)' }}>
            <button
              disabled={step === 1 || saving}
              onClick={() => setStep(prev => Math.max(1, prev - 1))}
              className="border border-border/50 rounded-lg px-5 py-2.5 text-xs font-mono-pm uppercase tracking-widest transition-all text-[var(--pm-on-surface-variant)] disabled:opacity-40 cursor-pointer"
            >
              Back
            </button>

            {step < 5 && (
              <button
                onClick={() => {
                  if (step === 1 && !workspaceName.trim()) return;
                  if (step === 2 && !selectedTemplate) return;
                  if (step === 4 && !settings.country) return;
                  setStep(prev => prev + 1);
                }}
                disabled={(step === 1 && !workspaceName.trim()) || (step === 2 && !selectedTemplate) || (step === 4 && !settings.country)}
                className="rounded-lg transition-all px-5 py-2.5 text-xs font-mono-pm uppercase tracking-widest font-semibold cursor-pointer shadow-md disabled:opacity-50"
                style={{ background: 'var(--pm-primary)', color: 'var(--pm-on-primary)' }}
              >
                {step === 4 ? 'Skip Preview' : 'Next'}
              </button>
            )}

            {step === 5 && (
              <button 
                disabled={saving} 
                onClick={saveWorkspace} 
                className="rounded-lg transition-all px-5 py-2.5 text-xs font-mono-pm uppercase tracking-widest font-semibold cursor-pointer shadow-md disabled:opacity-50"
                style={{ background: 'var(--pm-primary)', color: 'var(--pm-on-primary)' }}
              >
                {saving ? 'Saving...' : 'Save Workspace'}
              </button>
            )}

            {step === 6 && (
              <button 
                onClick={() => setStep(7)} 
                className="rounded-lg transition-all px-5 py-2.5 text-xs font-mono-pm uppercase tracking-widest font-semibold cursor-pointer shadow-md"
                style={{ background: 'var(--pm-primary)', color: 'var(--pm-on-primary)' }}
              >
                {invites.length > 0 ? 'Continue' : 'Skip'}
              </button>
            )}

            {step === 7 && (
              <button 
                onClick={() => navigate('/')} 
                className="rounded-lg transition-all px-5 py-2.5 text-xs font-mono-pm uppercase tracking-widest font-semibold cursor-pointer shadow-md"
                style={{ background: 'var(--pm-primary)', color: 'var(--pm-on-primary)' }}
              >
                Go to Dashboard
              </button>
            )}
          </div>
        </section>

        <aside 
          className="bg-surface-3/50 backdrop-blur-md border border-border/50 rounded-2xl p-8 shadow-sm h-fit space-y-6 font-geist"
          style={{ color: 'var(--pm-on-surface)' }}
        >
          <div>
            <p className="text-[10px] font-mono-pm uppercase tracking-[0.25em]" style={{ color: 'var(--pm-on-surface-variant)' }}>Operational Forecaster</p>
            <h3 className="mt-2.5 text-sm font-semibold tracking-tight uppercase" style={{ color: 'var(--pm-on-surface)' }}>Estimated Capacity ETA</h3>
          </div>
          
          <div className="border border-border/50 rounded-xl p-5 space-y-1 text-center bg-surface-3/50">
            <span className="block text-[9px] font-mono-pm uppercase" style={{ color: 'var(--pm-on-surface-variant)' }}>40h Initiative Completion</span>
            <span className="block mt-1 text-2xl font-bold tracking-tight" style={{ color: 'var(--pm-tertiary)' }}>{preview.predictedCompletion.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>

          <dl className="space-y-3.5 text-xs border-t pt-4" style={{ borderColor: 'rgba(70,69,84,0.15)', color: 'var(--pm-on-surface-variant)' }}>
            <div className="flex justify-between"><dt className="font-mono-pm uppercase text-[9px]">Daily Allotment</dt><dd className="font-semibold" style={{ color: 'var(--pm-on-surface)' }}>{preview.dailyCapacityHours}h</dd></div>
            <div className="flex justify-between"><dt className="font-mono-pm uppercase text-[9px]">Ingested Risk</dt><dd className="capitalize font-semibold" style={{ color: 'var(--pm-on-surface)' }}>{preview.risk}</dd></div>
            <div className="flex justify-between"><dt className="font-mono-pm uppercase text-[9px]">Confidence Factor</dt><dd className="font-semibold" style={{ color: 'var(--pm-on-surface)' }}>{preview.confidence}%</dd></div>
            <div className="flex justify-between"><dt className="font-mono-pm uppercase text-[9px]">Workspace Designation</dt><dd className="truncate max-w-[150px] font-semibold" style={{ color: 'var(--pm-on-surface)' }}>{workspaceName || 'ALPHA_DEFAULT'}</dd></div>
          </dl>

          {selectedTemplate && (
            <div className="border-t pt-5 space-y-3.5" style={{ borderColor: 'rgba(70,69,84,0.15)' }}>
              <p className="text-[9px] font-mono-pm uppercase tracking-[0.2em]" style={{ color: 'var(--pm-primary)' }}>Workflow Registry</p>
              <div className="space-y-3 text-xs" style={{ color: 'var(--pm-on-surface-variant)' }}>
                <div className="flex justify-between"><dt className="font-mono-pm uppercase text-[9px]">Base Template</dt><dd className="font-semibold" style={{ color: 'var(--pm-on-surface)' }}>{selectedTemplate.name}</dd></div>
                <div className="flex justify-between"><dt className="font-mono-pm uppercase text-[9px]">Execution Mode</dt><dd className="font-mono-pm text-[10px]" style={{ color: 'var(--pm-tertiary)' }}>{selectedTemplate.executionMode}</dd></div>
                <div className="flex justify-between"><dt className="font-mono-pm uppercase text-[9px]">Telemetry Columns</dt><dd className="font-semibold" style={{ color: 'var(--pm-on-surface)' }}>{selectedTemplate.lanes} Lanes</dd></div>
                <div className="flex justify-between items-start"><dt className="font-mono-pm uppercase text-[9px] shrink-0">Team Structure</dt><dd className="text-right text-[11px] font-semibold truncate max-w-[165px]" style={{ color: 'var(--pm-on-surface)' }}>{selectedTemplate.teamStructure}</dd></div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </ResolveLayout>
  );
}
