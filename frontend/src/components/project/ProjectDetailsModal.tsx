import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Clock, Terminal, Lock, X, AlertTriangle, Users, Layers, LayoutGrid, CheckCircle2, Plus, Activity, BrainCircuit, Trash2, History, ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react';
import { sha256 } from '../../utils/cryptoUtils';
import { Project, Team, User, Profile } from '../../types';
import { useDashboard } from '../../context/DashboardContext';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { calculateExpectedTime, calculateVariance } from '../../utils/timeUtils';
import { addWorkingHours, getDailyCapacity } from '../../utils/productivity';
import { activityLogService } from '../../services/activityLogService';
import { FilePanel } from '../common/FilePanel';

export function ProjectDetailsModal({
  project,
  teams,
  onClose,
  onUpdate,
  onDelete,
  workingHoursPerDay,
  currentUserProfile,
  userCustomRoles,
  workingTimeFrom = '09:00',
  workingTimeTo = '17:00'
}: {
  project: Project,
  teams: Team[],
  onClose: () => void,
  onUpdate: any,
  onDelete: (id: string, reason: string) => void,
  workingHoursPerDay: number,
  currentUserProfile: Profile | null,
  userCustomRoles: Record<string, string>,
  workingTimeFrom?: string,
  workingTimeTo?: string
}) {
  const { tasks, updateWorkspaceSettings, projectFrictionMetrics = {}, timelineShiftLedger = [], notify, workspaceSettingsBlob = {} } = useDashboard();
  const hasTasks = tasks.some(t => t.project_id === project.id);

  const [activeTab, setActiveTab] = useState<'general' | 'friction' | 'files'>('general');
  const [deltaDays, setDeltaDays] = useState('5');
  const [blockerCategory, setBlockerCategory] = useState('Client IT Team');
  const [blockerOwnership, setBlockerOwnership] = useState('Client');
  const [blockerReason, setBlockerReason] = useState('');

  const currentMetric = projectFrictionMetrics[project.id] || {
    currentState: 'active',
    activeDays: 0,
    passiveWaitDays: 0,
    blockedDays: 0,
    liabilityRatio: 0,
  };

  const [manActiveDays, setManActiveDays] = useState<string>('');
  const [manPassiveDays, setManPassiveDays] = useState<string>('');
  const [manBlockedDays, setManBlockedDays] = useState<string>('');

  useEffect(() => {
    if (projectFrictionMetrics[project.id]) {
      setManActiveDays(projectFrictionMetrics[project.id].activeDays.toString());
      setManPassiveDays(projectFrictionMetrics[project.id].passiveWaitDays.toString());
      setManBlockedDays(projectFrictionMetrics[project.id].blockedDays.toString());
    } else {
      setManActiveDays('0');
      setManPassiveDays('0');
      setManBlockedDays('0');
    }
  }, [project.id, projectFrictionMetrics]);

  const handleSaveManualDurations = async () => {
    if (!updateWorkspaceSettings) return;
    const projectDurations = { ...(workspaceSettingsBlob?.project_state_durations || {}) };
    const currentRecord = projectDurations[project.id] || {
      currentState: 'active',
      activeDays: 0,
      passiveWaitDays: 0,
      blockedDays: 0,
      lastStateChange: new Date().toISOString(),
    };

    projectDurations[project.id] = {
      ...currentRecord,
      activeDays: Number(manActiveDays) || 0,
      passiveWaitDays: Number(manPassiveDays) || 0,
      blockedDays: Number(manBlockedDays) || 0,
    };

    await updateWorkspaceSettings({
      project_state_durations: projectDurations,
    });
    if (notify) notify("State durations adjusted.", "success");
  };

  const handleStateTransition = async (newState: 'active' | 'passive_wait' | 'blocked') => {
    if (!updateWorkspaceSettings) return;

    const projectDurations = { ...(workspaceSettingsBlob?.project_state_durations || {}) };
    const currentRecord = projectDurations[project.id] || {
      currentState: 'active',
      activeDays: 0,
      passiveWaitDays: 0,
      blockedDays: 0,
      lastStateChange: new Date().toISOString(),
    };

    const prevChangeTime = currentRecord.lastStateChange ? new Date(currentRecord.lastStateChange) : new Date();
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - prevChangeTime.getTime());
    const diffDays = diffTime > 1000 ? Number((diffTime / (1000 * 60 * 60 * 24)).toFixed(3)) : 0.1;

    const prevState = currentRecord.currentState || 'active';
    let activeDays = currentRecord.activeDays || 0;
    let passiveWaitDays = currentRecord.passiveWaitDays || 0;
    let blockedDays = currentRecord.blockedDays || 0;

    if (prevState === 'active') activeDays += diffDays;
    else if (prevState === 'passive_wait') passiveWaitDays += diffDays;
    else if (prevState === 'blocked') blockedDays += diffDays;

    projectDurations[project.id] = {
      currentState: newState,
      activeDays: Number(activeDays.toFixed(3)),
      passiveWaitDays: Number(passiveWaitDays.toFixed(3)),
      blockedDays: Number(blockedDays.toFixed(3)),
      lastStateChange: now.toISOString(),
    };

    await updateWorkspaceSettings({
      project_state_durations: projectDurations,
    });
    
    if (notify) notify(`Initiative state transitioned to: ${newState.toUpperCase()}`, "success");
  };

  const handleAddShiftEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateWorkspaceSettings) return;

    const shiftAmount = Number(deltaDays);
    if (isNaN(shiftAmount) || shiftAmount <= 0) return;

    const newEvent = {
      id: `shift-${Date.now()}`,
      projectId: project.id,
      projectName: project.name,
      deltaDays: shiftAmount,
      blockerCategory,
      ownership: blockerOwnership,
      timestamp: new Date().toISOString(),
      reason: blockerReason,
    };

    const nextLedger = [...timelineShiftLedger, newEvent];

    await updateWorkspaceSettings({
      timeline_shift_ledger: nextLedger,
    });

    const newDrift = (project.delay_drift_days || 0) + shiftAmount;
    await onUpdate(project.id, { delay_drift_days: newDrift });

    setBlockerReason('');
    
    if (notify) notify(`Timeline shift of +${shiftAmount} days logged.`, "success");
  };

  const [name, setName] = useState(project.name);
  const [status, setStatus] = useState(project.status);
  const [priority, setPriority] = useState(project.priority);
  const [teamId, setTeamId] = useState(project.team_id || '');
  const [pBest, setPBest] = useState(project.pert_best.toString());
  const [pLikely, setPLikely] = useState(project.pert_likely.toString());
  const [pWorst, setPWorst] = useState(project.pert_worst.toString());
  const [proposedStartDate, setProposedStartDate] = useState(project.proposed_start_date?.substring(0, 10) || '');
  const [clientDeadline, setClientDeadline] = useState(project.client_deadline?.substring(0, 10) || '');
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const hasAllData = pBest !== '' && pLikely !== '' && pWorst !== '' && proposedStartDate !== '' && clientDeadline !== '';

  const team = teams.find(t => t.id === teamId);
  const parsedTeamData = team ? (team.data as Record<string, unknown>) : null;
  const engineerCount = Math.max(1, (parsedTeamData?.developer_ids as string[] | undefined)?.length || 1);

  const expectedRealHours = calculateExpectedTime(Number(pBest), Number(pLikely), Number(pWorst));
  const productiveHoursPerDay = workingHoursPerDay * 0.8;
  const calendarExpected = (expectedRealHours / productiveHoursPerDay / engineerCount).toFixed(2);
  const varianceVal = calculateVariance(Number(pBest) || 0, Number(pWorst) || 0);
  const stdDev = isNaN(varianceVal) ? 0 : Math.sqrt(varianceVal);
  const isPlanning = status === 'planning';

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);
  const nowLive = useMemo(() => new Date(), [tick]);
  const workWindow = useMemo(() => ({ workStart: workingTimeFrom, workEnd: workingTimeTo, lunchDuration: 60, workingDays: [1, 2, 3, 4, 5], productivityFactor: 0.8, holidays: [], shutdowns: [] }), [workingTimeFrom, workingTimeTo]);
  
  const startDate = proposedStartDate ? new Date(proposedStartDate) : new Date(project.created_at);
  const deadline = clientDeadline ? new Date(clientDeadline) : null;

  const etaCompletionDate = useMemo(() => {
    if (isPlanning) return nowLive;
    return addWorkingHours(startDate, expectedRealHours / engineerCount, workWindow);
  }, [startDate, expectedRealHours, engineerCount, workWindow, isPlanning, nowLive]);
  const etaRemainingDays = useMemo(() => {
    if (isPlanning) return 0;
    if (nowLive >= etaCompletionDate) return 0;
    let count = 0;
    let cursor = new Date(nowLive);
    while (cursor < etaCompletionDate) {
      const cap = getDailyCapacity(cursor, workWindow);
      if (cap > 0) count += cap / productiveHoursPerDay;
      cursor.setDate(cursor.getDate() + 1);
    }
    return Math.max(0, Number(count.toFixed(1)));
  }, [nowLive, etaCompletionDate, workWindow, productiveHoursPerDay, isPlanning]);

  const [changeReasonPrompt, setChangeReasonPrompt] = useState<{ changes: any, open: boolean }>({ changes: null, open: false });
  const [changeReason, setChangeReason] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [dbLogs, setDbLogs] = useState<any[]>([]);

  const [verificationState, setVerificationState] = useState<'UNVERIFIED' | 'VERIFYING' | 'SECURED' | 'TAMPERED'>('UNVERIFIED');
  const [scanningIndex, setScanningIndex] = useState<number | null>(null);
  const [tamperedIndex, setTamperedIndex] = useState<number | null>(null);
  const [localLogs, setLocalLogs] = useState<any[]>([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const logs = await activityLogService.getLogs(project.workspace_id, project.id);
        if (logs && logs.length > 0) {
          const mapped = logs.map(d => ({
            timestamp: d.created_at,
            changes: { action: d.action, ...d.metadata },
            reason: d.metadata?.reason || d.action,
            authorName: d.actor_id,
            authorRole: '',
            previousHash: d.previous_hash || 'GENESIS_BLOCK',
            hash: d.hash || ''
          }));
          setDbLogs(mapped);
          setLocalLogs(mapped);
        } else {
          const fallback = (project.tags || [])
            .filter(t => t.startsWith('LOG:'))
            .map(t => {
              const parsed = JSON.parse(t.substring(4));
              return {
                ...parsed,
                previousHash: parsed.previousHash || 'GENESIS_BLOCK',
                hash: parsed.hash || ''
              };
            });
          setLocalLogs(fallback);
        }
      } catch (err) {
        console.error("Error fetching activity logs:", err);
      }
    };
    fetchLogs();
  }, [project.id, project.workspace_id, project.tags]);

  const verifyLedger = async () => {
    if (localLogs.length === 0) return;
    setVerificationState('VERIFYING');
    setTamperedIndex(null);

    let isTampered = false;
    let localTamperedIdx: number | null = null;
    let currentPrevHash = 'GENESIS_BLOCK';

    for (let i = 0; i < localLogs.length; i++) {
      setScanningIndex(i);
      // artificial delay for scanning progress visualization
      await new Promise(resolve => setTimeout(resolve, 300));

      const log = localLogs[i];

      // 1. Verify previous hash matches current chain predecessor
      if (log.previousHash !== currentPrevHash) {
        if (!isTampered) {
          isTampered = true;
          localTamperedIdx = i;
          setVerificationState('TAMPERED');
          setTamperedIndex(i);
        }
        currentPrevHash = log.hash || currentPrevHash;
        continue;
      }

      // 2. Re-compute block hash
      const message = `${project.id}${log.timestamp}${log.changes}${log.reason}${log.authorName}${log.authorRole}${log.previousHash}`;
      const computedHash = await sha256(message);

      if (log.hash !== computedHash) {
        if (!isTampered) {
          isTampered = true;
          localTamperedIdx = i;
          setVerificationState('TAMPERED');
          setTamperedIndex(i);
        }
        currentPrevHash = log.hash || currentPrevHash;
        continue;
      }

      currentPrevHash = log.hash;

      // Reset state if we encounter an authorized repair block
      if (log.changes.action === 'ledger_chain_repaired' || log.changes.includes('ledger_chain_repaired')) {
        isTampered = false;
        localTamperedIdx = null;
        setVerificationState('VERIFYING'); // Will become SECURED at the end
        setTamperedIndex(null);
      }
    }

    if (!isTampered) {
      setVerificationState('SECURED');
    }
    setScanningIndex(null);
  };

  const simulateTampering = () => {
    if (localLogs.length === 0) return;
    const updated = [...localLogs];
    const targetIdx = Math.floor(Math.random() * updated.length);
    updated[targetIdx] = {
      ...updated[targetIdx],
      changes: updated[targetIdx].changes + ' [TAMPERED_METADATA_VALUE]'
    };
    setLocalLogs(updated);
    setVerificationState('UNVERIFIED');
    setTamperedIndex(null);
    setScanningIndex(null);
  };

  const logs = useMemo(() => {
    return localLogs;
  }, [localLogs]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const changes: string[] = [];
    if (status !== project.status) changes.push(`Status (${project.status} -> ${status})`);
    if (priority !== project.priority) changes.push(`Priority (${project.priority} -> ${priority})`);
    if ((teamId || null) !== (project.team_id || null)) {
      const oldTeam = teams.find(t => t.id === project.team_id)?.name || 'UNALLOCATED';
      const newTeam = teams.find(t => t.id === teamId)?.name || 'UNALLOCATED';
      changes.push(`Team (${oldTeam} -> ${newTeam})`);
    }
    const oldDeadline = project.client_deadline?.substring(0, 10) || 'None';
    const newDeadline = clientDeadline || 'None';
    if (oldDeadline !== newDeadline) changes.push(`Client Deadline (${oldDeadline} -> ${newDeadline})`);

    const oldStart = project.proposed_start_date?.substring(0, 10) || 'None';
    const newStart = proposedStartDate || 'None';
    if (oldStart !== newStart) changes.push(`Proposed Start (${oldStart} -> ${newStart})`);

    const updates = {
      name,
      status: status as any,
      priority: priority as any,
      team_id: teamId || null,
      pert_best: Number(pBest),
      pert_likely: Number(pLikely),
      pert_worst: Number(pWorst),
      proposed_start_date: proposedStartDate || null,
      client_deadline: clientDeadline || null
    };

    if (changes.length > 0) {
      setChangeReasonPrompt({ changes: { ...updates, _log_summary: changes.join(', ') }, open: true });
    } else {
      onUpdate(project.id, updates);
      onClose();
    }
  };

  const handleConfirmChange = () => {
    if (!changeReason) return;

    const finalUpdates = { ...changeReasonPrompt.changes };
    delete finalUpdates._log_summary;

    // Strip LOG: tags from finalUpdates tags to prevent saving duplicate logging strings
    if (finalUpdates.tags) {
      finalUpdates.tags = finalUpdates.tags.filter((t: string) => !t.startsWith('LOG:'));
    }

    onUpdate(project.id, finalUpdates, {
      changes: changeReasonPrompt.changes._log_summary,
      reason: changeReason,
      authorName: currentUserProfile?.full_name || currentUserProfile?.email || 'Unknown User',
      authorRole: (currentUserProfile?.id && userCustomRoles[currentUserProfile.id]) || currentUserProfile?.role || 'viewer'
    });

    setChangeReasonPrompt({ changes: null, open: false });
    onClose();
  };

  const deadlineVariance = deadline ? Math.floor((deadline.getTime() - etaCompletionDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-bg/80 backdrop-blur-md" />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }} 
        animate={{ opacity: 1, scale: 1, y: 0 }} 
        exit={{ opacity: 0, scale: 0.95, y: 20 }} 
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative bg-surface/80 backdrop-blur-xl border border-border/50 w-full max-w-2xl overflow-y-auto max-h-[90vh] md:max-h-none shadow-2xl shadow-black/50 rounded-2xl my-auto"
      >
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-teal-500 to-emerald-500 z-50" />

        {showLogs && (
          <div className="absolute inset-0 z-50 bg-surface flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-border flex justify-between items-center bg-bg">
              <h4 className="text-sm font-sans tracking-tight text-text-secondary uppercase tracking-wide flex items-center gap-2">
                <History className="w-4 h-4 text-signal-info" /> Project Ledger Center
              </h4>
              <button
                type="button"
                onClick={() => setShowLogs(false)}
                className="p-2 border border-border hover:bg-[var(--pm-surface)]/5 transition-colors"
              >
                <Plus className="w-4 h-4 rotate-45 text-text-secondary" />
              </button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              
              {/* Ledger Integrity Guard Panel */}
              <div className="border border-border bg-surface-3 backdrop-blur-md p-6 rounded-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    {verificationState === 'UNVERIFIED' && (
                      <div className="p-3 bg-[var(--pm-surface)]/5 border border-border text-text-tertiary">
                        <Shield className="w-6 h-6" />
                      </div>
                    )}
                    {verificationState === 'VERIFYING' && (
                      <div className="p-3 bg-signal-warning-bg border border-yellow-500/20 text-signal-warning transition-opacity duration-300">
                        <RefreshCw className="w-6 h-6 animate-spin" />
                      </div>
                    )}
                    {verificationState === 'SECURED' && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                    )}
                    {verificationState === 'TAMPERED' && (
                      <div className="p-3 bg-signal-critical-bg border border-red-500/20 text-signal-critical animate-bounce">
                        <ShieldAlert className="w-6 h-6" />
                      </div>
                    )}
                    <div>
                      <h5 className="text-xs font-sans tracking-tight uppercase tracking-[0.2em] font-bold">
                        {verificationState === 'UNVERIFIED' && "Ledger Verification Pending"}
                        {verificationState === 'VERIFYING' && "Analyzing Ledger Integrity"}
                        {verificationState === 'SECURED' && "Ledger Verified & Secured"}
                        {verificationState === 'TAMPERED' && "WARNING: TAMPERING DETECTED!"}
                      </h5>
                      <p className="text-[10px] font-mono text-text-tertiary mt-1 leading-relaxed">
                        {verificationState === 'UNVERIFIED' && "Cryptographic blockchain verification ready. Confirm WORM ledger sequence status."}
                        {verificationState === 'VERIFYING' && `Scanning block #${(scanningIndex ?? 0) + 1} of ${localLogs.length}... verifying signature matching.`}
                        {verificationState === 'SECURED' && `All ${localLogs.length} historical blocks matched SHA-256 genesis hashes perfectly.`}
                        {verificationState === 'TAMPERED' && `Chain validation broken at Block #${(tamperedIndex ?? 0) + 1}. Predecessor pointer mismatch detected.`}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {localLogs.length > 0 && (
                      <button
                        type="button"
                        onClick={verifyLedger}
                        disabled={verificationState === 'VERIFYING'}
                        className={`px-4 py-2 text-[10px] uppercase font-mono tracking-wide font-bold border transition-all ${
                          verificationState === 'SECURED'
                            ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-400 hover:bg-emerald-500/20'
                            : verificationState === 'TAMPERED'
                            ? 'bg-signal-critical-bg border-red-500/35 text-signal-critical hover:bg-signal-critical-bg'
                            : 'bg-[var(--pm-inverse-surface)] text-[var(--pm-inverse-on-surface)] border-transparent hover:opacity-90'
                        }`}
                      >
                        {verificationState === 'VERIFYING' ? "Scanning..." : verificationState === 'SECURED' ? "Re-Verify" : "Verify Ledger"}
                      </button>
                    )}
                    {localLogs.length > 0 && (
                      <button
                        type="button"
                        onClick={simulateTampering}
                        disabled={verificationState === 'VERIFYING'}
                        className="px-4 py-2 text-[10px] uppercase font-medium tracking-wide border border-red-500/20 text-signal-critical/90 hover:bg-signal-critical-bg transition-all"
                        title="Mutate local block state to trigger warning UI"
                      >
                        Simulate Tamper
                      </button>
                    )}
                  </div>
                </div>

                {/* Verification Progress Bar */}
                {verificationState === 'VERIFYING' && (
                  <div className="w-full bg-[var(--pm-surface)]/5 h-1 relative overflow-hidden rounded-full">
                    <div
                      className="bg-yellow-500 h-full transition-all duration-300"
                      style={{ width: `${((scanningIndex ?? 0) / localLogs.length) * 100}%` }}
                    />
                  </div>
                )}
                {verificationState === 'SECURED' && (
                  <div className="w-full bg-emerald-500/20 h-1 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full w-full" />
                  </div>
                )}
                {verificationState === 'TAMPERED' && (
                  <div className="w-full bg-signal-critical-bg h-1 rounded-full overflow-hidden">
                    <div className="bg-red-500 h-full w-full transition-opacity duration-300" />
                  </div>
                )}
              </div>

              {/* Logs List */}
              <div className="space-y-4">
                {localLogs.length === 0 ? (
                  <p className="text-xs font-mono text-text-tertiary italic">No historical adjustments recorded.</p>
                ) : (
                  [...localLogs].reverse().map((log, reversedIndex) => {
                    const originalIndex = localLogs.length - 1 - reversedIndex;
                    const isScanning = verificationState === 'VERIFYING' && scanningIndex === originalIndex;
                    const isTamperedBlock = verificationState === 'TAMPERED' && tamperedIndex === originalIndex;
                    const isSecuredBlock = verificationState === 'SECURED';

                    return (
                      <div
                        key={originalIndex}
                        className={`border p-5 flex flex-col gap-3 transition-all relative ${
                          isScanning
                            ? 'border-yellow-500 bg-yellow-500/[0.02] shadow-sm'
                            : isTamperedBlock
                            ? 'border-red-500 bg-red-500/[0.04] shadow-sm'
                            : isSecuredBlock
                            ? 'border-emerald-500/20 bg-emerald-500/[0.01]'
                            : 'border-border bg-[var(--pm-surface)]/5'
                        }`}
                      >
                        {/* Upper Details Row */}
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-[10px] font-mono">
                          <div className="flex items-center gap-2">
                            <span className="text-text-quaternary uppercase tracking-wide font-bold">Block #{originalIndex + 1}</span>
                            <span className="text-text-tertiary">{new Date(log.timestamp).toLocaleString()}</span>
                          </div>
                          
                          {/* Block Status Badge */}
                          <div className="flex items-center gap-2">
                            {isScanning && (
                              <span className="bg-signal-warning-bg border border-yellow-500/30 text-signal-warning px-2 py-0.5 rounded-sm uppercase tracking-wider text-[8px] transition-opacity duration-300">
                                Scanning...
                              </span>
                            )}
                            {isTamperedBlock && (
                              <span className="bg-signal-critical-bg border border-red-500/40 text-signal-critical px-2 py-0.5 rounded-sm uppercase tracking-wider text-[8px] font-bold transition-opacity duration-300">
                                TAMPER DETECTED
                              </span>
                            )}
                            {isSecuredBlock && !isTamperedBlock && (
                              <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-sm uppercase tracking-wider text-[8px]">
                                Secured Block
                              </span>
                            )}
                            {log.authorName && (
                              <span className="text-signal-info font-bold uppercase tracking-wider">
                                BY: {log.authorName} ({log.authorRole || 'Viewer'})
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Audit Details */}
                        <div className="space-y-1.5 py-1 border-y border-border-subtle">
                          <p className="text-xs font-mono text-text-secondary leading-relaxed">
                            <span className="text-text-quaternary uppercase tracking-wide text-[9px] mr-2">Changes:</span> 
                            {log.changes}
                          </p>
                          <p className="text-xs font-mono text-signal-warning/90 leading-relaxed">
                            <span className="text-text-quaternary uppercase tracking-wide text-[9px] mr-2">Reason:</span> 
                            {log.reason}
                          </p>
                        </div>

                        {/* Hash badging */}
                        <div className="flex flex-wrap items-center gap-3 pt-1 text-[9px] font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className="text-text-quaternary uppercase tracking-tighter">HASH:</span>
                            <span className={`px-2 py-0.5 border rounded-sm font-mono tracking-tight transition-colors ${
                              isTamperedBlock
                                ? 'bg-signal-critical-bg border-red-500/30 text-signal-critical'
                                : 'bg-bg border-border text-text-secondary'
                            }`} title={log.hash}>
                              {log.hash ? `0x${log.hash.substring(0, 8)}...` : 'None'}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <span className="text-text-quaternary uppercase tracking-tighter">PREV HASH:</span>
                            {log.previousHash === 'GENESIS_BLOCK' ? (
                              <span className="bg-surface-3 border border-border text-signal-info px-2 py-0.5 rounded-sm uppercase text-[8px] tracking-wide font-bold">
                                GENESIS
                              </span>
                            ) : (
                              <span className="bg-bg border border-border text-text-tertiary px-2 py-0.5 rounded-sm font-mono tracking-tight" title={log.previousHash}>
                                {log.previousHash ? `0x${log.previousHash.substring(0, 8)}...` : 'None'}
                              </span>
                            )}
                          </div>
                        </div>

                      </div>
                    );
                  })
                )}
              </div>

            </div>
          </div>
        )}

        {changeReasonPrompt.open && (
          <div className="absolute inset-0 z-50 bg-surface backdrop-blur-sm flex items-center justify-center p-8">
            <div className="w-full max-w-md bg-bg border border-border p-6 space-y-4 shadow-2xl">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-signal-warning" />
                <h4 className="text-sm font-sans tracking-tight text-text-secondary uppercase tracking-wide">Reason for Adjustment</h4>
              </div>
              <p className="text-[10px] font-mono text-text-tertiary">The following adjustments require documentation for compliance:</p>
              <ul className="text-[10px] font-mono text-text-secondary list-disc pl-4 space-y-1">
                {changeReasonPrompt.changes._log_summary.split(', ').map((c: string) => <li key={c}>{c}</li>)}
              </ul>
              <textarea
                autoFocus
                required
                value={changeReason}
                onChange={e => setChangeReason(e.target.value)}
                className="w-full bg-bg border border-border p-3 text-xs font-mono min-h-[100px] focus:border-border-subtle0 outline-none"
                placeholder="Enter reason for modifying these parameters..."
              />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={handleConfirmChange} disabled={!changeReason} className="flex-1 bg-[var(--pm-surface)] text-[var(--pm-text)] text-[10px] uppercase font-medium py-2 disabled:opacity-50 tracking-wide font-semibold">Log & Commit</button>
                <button type="button" onClick={() => setChangeReasonPrompt({ changes: null, open: false })} className="flex-1 border border-border text-text-secondary text-[10px] uppercase font-mono py-2 hover:bg-[var(--pm-surface)]/5 tracking-wide">Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div className="p-8">
          <div className="flex justify-between items-start mb-8">
            <div className="flex gap-4 items-center">
              <div className="w-12 h-12 bg-teal-500/10 border border-teal-500/20 rounded-xl flex items-center justify-center shadow-inner shrink-0">
                <BrainCircuit className="w-6 h-6 text-teal-400" />
              </div>
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-text-primary">Predictive Workspace: {project.name}</h3>
                <span className="text-[11px] font-bold text-text-tertiary uppercase tracking-widest">Project Overview</span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 border border-border/50 rounded-xl hover:bg-surface-3 transition-colors text-text-secondary hover:text-text-primary">
              <Plus className="w-5 h-5 rotate-45" />
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-border mb-6">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`px-4 py-2 text-xs font-mono uppercase tracking-wider border-b-2 transition-all ${
                activeTab === 'general' ? 'border-text-primary text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-secondary'
              }`}
            >
              Scope & PERT
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('friction')}
              className={`px-4 py-2 text-xs font-mono uppercase tracking-wider border-b-2 transition-all ${
                activeTab === 'friction' ? 'border-text-primary text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-secondary'
              }`}
            >
              Delivery Friction & Shifts
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('files')}
              className={`px-4 py-2 text-xs font-mono uppercase tracking-wider border-b-2 transition-all ${
                activeTab === 'files' ? 'border-text-primary text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-secondary'
              }`}
            >
              Files
            </button>
          </div>

          {activeTab === 'general' ? (
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-[11px] uppercase tracking-widest font-bold text-text-secondary mb-2 flex items-center gap-2">Project Designation <span className="w-1.5 h-1.5 rounded-full bg-teal-500" /></label>
                  <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-surface-3/50 border border-border/50 h-12 px-4 rounded-xl text-sm focus:border-teal-500/50 outline-none text-text-primary focus:bg-surface-3 transition-all" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-text-secondary mb-2">Status</label>
                    <select value={status} onChange={e => setStatus(e.target.value as any)} className="w-full bg-surface-3/50 border border-border/50 h-12 px-4 rounded-xl text-xs focus:border-teal-500/50 outline-none hover:bg-surface-3 transition-colors cursor-pointer appearance-none">
                      <option value="planning">PLANNING</option>
                      <option value="in-progress">IN PROGRESS</option>
                      <option value="review">REVIEW</option>
                      <option value="deployed">DEPLOYED</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-text-secondary mb-2">Priority</label>
                    <select value={priority} onChange={e => setPriority(e.target.value as any)} className="w-full bg-surface-3/50 border border-border/50 h-12 px-4 rounded-xl text-xs focus:border-teal-500/50 outline-none hover:bg-surface-3 transition-colors cursor-pointer appearance-none">
                      <option value="low">LOW</option>
                      <option value="medium">MEDIUM</option>
                      <option value="high">HIGH</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-text-secondary mb-2">Proposed Start</label>
                    <input type="date" value={proposedStartDate} onChange={e => setProposedStartDate(e.target.value)} className="w-full bg-surface-3/50 border border-border/50 h-12 px-4 rounded-xl text-xs focus:border-teal-500/50 outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-text-secondary mb-2">Client Deadline</label>
                    <input type="date" value={clientDeadline} onChange={e => setClientDeadline(e.target.value)} className="w-full bg-surface-3/50 border border-border/50 h-12 px-4 rounded-xl text-xs focus:border-teal-500/50 outline-none transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-widest font-bold text-text-secondary mb-2">Assign Team</label>
                  <select value={teamId} onChange={e => setTeamId(e.target.value)} className="w-full bg-surface-3/50 border border-border/50 h-12 px-4 rounded-xl text-xs focus:border-teal-500/50 outline-none hover:bg-surface-3 transition-colors cursor-pointer appearance-none">
                    <option value="">UNALLOCATED</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                <div className="pt-4 border-t border-border flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setShowLogs(true)}
                    className="flex items-center gap-2 text-xs font-mono text-signal-info hover:text-blue-300 transition-colors uppercase tracking-wide whitespace-nowrap"
                  >
                    <History className="w-4 h-4" /> View Logs
                  </button>

                  {!isDeleting ? (
                    <button
                      type="button"
                      onClick={() => setIsDeleting(true)}
                      className="flex items-center gap-2 text-xs font-mono text-signal-critical hover:text-signal-critical transition-colors uppercase tracking-wide whitespace-nowrap"
                    >
                      <Trash2 className="w-4 h-4" /> Archive
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <label className="block text-[10px] uppercase font-mono text-signal-critical/80">Reason for Archiveing</label>
                      <textarea
                        required
                        value={deleteReason}
                        onChange={e => setDeleteReason(e.target.value)}
                        className="w-full bg-bg border border-red-500/30 p-3 font-mono text-xs focus:border-red-500 outline-none min-h-[80px]"
                        placeholder="Specify reason..."
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onDelete(project.id, deleteReason)}
                          className="flex-1 bg-red-500 text-text-primary py-2 text-[10px] font-mono uppercase tracking-wide hover:bg-red-600 transition-colors"
                        >
                          Confirm Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsDeleting(false)}
                          className="flex-1 border border-border text-text-secondary py-2 text-[10px] font-mono uppercase tracking-wide hover:bg-[var(--pm-surface)]/5 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-surface-3/30 border border-border/50 p-6 rounded-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10"><Activity className="w-24 h-24" /></div>
                  <h4 className="text-[11px] font-bold tracking-widest text-text-secondary uppercase mb-6 flex items-center gap-2">Predictive Outcome</h4>

                  {hasAllData ? (
                    <>
                      <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
                        <div className="bg-surface-3/50 p-4 rounded-xl border border-border/30">
                          <p className="text-[10px] font-bold tracking-widest text-text-secondary uppercase mb-2">Total Real Hours</p>
                          <p className="text-2xl font-bold tracking-tight text-[var(--pm-text)] dark:text-white">{expectedRealHours.toFixed(1)}<span className="text-sm text-text-tertiary ml-1">h</span></p>
                        </div>
                        <div className="bg-surface-3/50 p-4 rounded-xl border border-border/30">
                          <p className="text-[10px] font-bold tracking-widest text-text-secondary uppercase mb-2">Working Days</p>
                          <p className="text-2xl font-bold tracking-tight text-[var(--pm-text)] dark:text-white">{calendarExpected}<span className="text-sm text-text-tertiary ml-1">d</span></p>
                        </div>
                        <div className="bg-blue-500/10 p-4 rounded-xl border border-blue-500/20">
                          <p className="text-[10px] font-bold tracking-widest text-blue-400 uppercase mb-2">Remaining ETA</p>
                          <p className="text-2xl font-bold tracking-tight text-blue-300">{etaRemainingDays.toFixed(1)}<span className="text-sm text-blue-400/50 ml-1">d</span></p>
                        </div>
                        <div className={`p-4 rounded-xl border ${deadlineVariance !== null && deadlineVariance < 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                          <p className={`text-[10px] font-bold tracking-widest uppercase mb-2 ${deadlineVariance !== null && deadlineVariance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>Variance</p>
                          <p className={`text-xl font-bold ${deadlineVariance !== null && deadlineVariance < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                            {deadlineVariance !== null ? `${Math.abs(deadlineVariance)}d ${deadlineVariance < 0 ? 'behind' : 'ahead'}` : 'N/A'}
                          </p>
                        </div>
                      </div>

                      <div className="mb-6 bg-surface-3/50 border border-border/50 rounded-xl p-4">
                        <p className="text-[10px] font-bold tracking-widest text-text-secondary uppercase mb-2">Predicted End</p>
                        <p className="text-lg font-bold tracking-tight text-text-primary">{etaCompletionDate.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                      </div>
                    </>
                  ) : (
                    <div className="bg-signal-warning-bg border border-yellow-500/20 p-4 mb-6 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-signal-warning shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-mono text-signal-warning uppercase tracking-wide mb-1">Calculation Suspended</p>
                        <p className="text-[10px] font-mono text-signal-warning/80 leading-relaxed">Please obtain and input all PERT estimates and timeline constraints to initiate the predictive outcome engine.</p>
                      </div>
                    </div>
                  )}

                  {hasTasks && (
                    <div className="bg-surface-3 border border-border p-3 mb-4">
                      <p className="text-[9px] font-mono text-signal-info uppercase tracking-wide mb-0.5">Automated Aggregation</p>
                      <p className="text-[10px] font-mono text-text-secondary leading-tight">
                        PERT parameters are dynamically aggregated from task-level estimations. Manual override suspended.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2 mb-6">
                    <div>
                      <p className="text-[9px] font-mono text-text-secondary uppercase tracking-tighter mb-1">BEST (H)</p>
                      <input 
                        type="number" 
                        step="0.1" 
                        value={pBest} 
                        onChange={e => setPBest(e.target.value)} 
                        disabled={hasTasks}
                        className="w-full bg-bg border border-border text-center py-1 font-mono text-[10px] text-text-primary disabled:opacity-50 disabled:cursor-not-allowed" 
                      />
                    </div>
                    <div>
                      <p className="text-[9px] font-mono text-text-secondary uppercase tracking-tighter mb-1">LIKELY (H)</p>
                      <input 
                        type="number" 
                        step="0.1" 
                        value={pLikely} 
                        onChange={e => setPLikely(e.target.value)} 
                        disabled={hasTasks}
                        className="w-full bg-bg border border-border text-center py-1 font-mono text-[10px] text-text-primary disabled:opacity-50 disabled:cursor-not-allowed" 
                      />
                    </div>
                    <div>
                      <p className="text-[9px] font-mono text-text-secondary uppercase tracking-tighter mb-1">WORST (H)</p>
                      <input 
                        type="number" 
                        step="0.1" 
                        value={pWorst} 
                        onChange={e => setPWorst(e.target.value)} 
                        disabled={hasTasks}
                        className="w-full bg-bg border border-border text-center py-1 font-mono text-[10px] text-text-primary disabled:opacity-50 disabled:cursor-not-allowed" 
                      />
                    </div>
                  </div>

                  {hasAllData && (
                    <div className="pt-4 border-t border-border-subtle">
                      <div className="flex justify-between items-center"><span className="text-[11px] font-mono text-text-secondary uppercase tracking-tighter">Variance calibration</span><span className="text-[10px] font-mono text-signal-warning/80">±{stdDev.toFixed(2)}σ</span></div>
                      <p className="text-[10px] font-mono text-text-secondary mt-1 italic leading-tight">Parallel processing factor: {engineerCount} engineers.</p>
                    </div>
                  )}
                </div>
                <button type="submit" className="w-full bg-[var(--pm-panel)] text-[var(--pm-text)] h-12 font-semibold uppercase tracking-wide text-[10px] hover:bg-neutral-200 transition-all shadow-xl shadow-white/5">
                  Commit System Updates
                </button>
              </div>
            </form>
          ) : activeTab === 'friction' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
              {/* Left Column: Delivery Friction Summary */}
              <div className="space-y-6">
                <div>
                  <h4 className="text-[10px] font-sans text-text-secondary uppercase tracking-wide mb-3">Execution State Management</h4>
                  <p className="text-[11px] text-text-tertiary leading-relaxed mb-4">
                    Transition the current delivery state to model passive latency and contractually relevant wait-state friction.
                  </p>
                  
                  {/* Current State Indicator */}
                  <div className="bg-[var(--pm-surface)]/5 border border-border p-4 rounded-sm mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-mono text-text-secondary uppercase">Current State</span>
                      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-sm font-bold ${
                        currentMetric.currentState === 'active' ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-500/20' :
                        currentMetric.currentState === 'passive_wait' ? 'bg-amber-950/30 text-amber-400 border border-amber-500/20' :
                        'bg-rose-950/30 text-rose-400 border border-rose-500/20'
                      }`}>
                        {currentMetric.currentState === 'active' ? 'Active Execution' :
                         currentMetric.currentState === 'passive_wait' ? 'Passive Waiting' :
                         'Blocked'}
                      </span>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => handleStateTransition('active')}
                        className={`flex-1 text-[9px] font-mono uppercase py-1.5 border transition-all ${
                          currentMetric.currentState === 'active' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30 font-bold' : 'border-border text-text-tertiary hover:bg-[var(--pm-surface)]/5'
                        }`}
                      >
                        Active
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStateTransition('passive_wait')}
                        className={`flex-1 text-[9px] font-mono uppercase py-1.5 border transition-all ${
                          currentMetric.currentState === 'passive_wait' ? 'bg-amber-950/40 text-amber-400 border-amber-500/30 font-bold' : 'border-border text-text-tertiary hover:bg-[var(--pm-surface)]/5'
                        }`}
                      >
                        Wait
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStateTransition('blocked')}
                        className={`flex-1 text-[9px] font-mono uppercase py-1.5 border transition-all ${
                          currentMetric.currentState === 'blocked' ? 'bg-rose-950/40 text-rose-400 border-rose-500/30 font-bold' : 'border-border text-text-tertiary hover:bg-[var(--pm-surface)]/5'
                        }`}
                      >
                        Block
                      </button>
                    </div>
                  </div>
                </div>

                {/* State Duration Tracker & Manual Overrides */}
                <div className="bg-[var(--pm-surface)]/5 border border-border p-4 rounded-sm">
                  <h5 className="text-[10px] font-sans text-text-secondary uppercase tracking-wide mb-3">State Duration Calibration (Days)</h5>
                  <div className="space-y-3 mb-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[10px] font-mono text-emerald-400 uppercase">Active (Engineering)</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={manActiveDays}
                        onChange={e => setManActiveDays(e.target.value)}
                        className="bg-bg border border-border text-right px-2 py-1 w-20 font-mono text-[10px] focus:border-white/40 outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[10px] font-mono text-amber-400 uppercase">Passive Waiting (Latency)</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={manPassiveDays}
                        onChange={e => setManPassiveDays(e.target.value)}
                        className="bg-bg border border-border text-right px-2 py-1 w-20 font-mono text-[10px] focus:border-white/40 outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[10px] font-mono text-rose-400 uppercase">Blocked (Failed State)</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={manBlockedDays}
                        onChange={e => setManBlockedDays(e.target.value)}
                        className="bg-bg border border-border text-right px-2 py-1 w-20 font-mono text-[10px] focus:border-white/40 outline-none"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveManualDurations}
                    className="w-full bg-surface-3 hover:bg-surface-4 text-text-primary text-[10px] uppercase font-mono py-1.5 border border-border transition-all"
                  >
                    Calibrate Durations
                  </button>
                </div>

                {/* Liability Ratio & Friction Visualizer */}
                <div className="bg-[var(--pm-surface)]/5 border border-border p-4 rounded-sm">
                  <h5 className="text-[10px] font-sans text-text-secondary uppercase tracking-wide mb-3">Liability Analysis</h5>
                  
                  {/* Visual Bar Split */}
                  <div className="h-2 w-full bg-surface-3 rounded-full flex overflow-hidden mb-3">
                    {Number(manActiveDays) > 0 && (
                      <div
                        style={{ width: `${(Number(manActiveDays) / (Number(manActiveDays) + Number(manPassiveDays) + Number(manBlockedDays) || 1)) * 100}%` }}
                        className="bg-emerald-500 h-full"
                        title="Active"
                      />
                    )}
                    {Number(manPassiveDays) > 0 && (
                      <div
                        style={{ width: `${(Number(manPassiveDays) / (Number(manActiveDays) + Number(manPassiveDays) + Number(manBlockedDays) || 1)) * 100}%` }}
                        className="bg-amber-500 h-full"
                        title="Wait"
                      />
                    )}
                    {Number(manBlockedDays) > 0 && (
                      <div
                        style={{ width: `${(Number(manBlockedDays) / (Number(manActiveDays) + Number(manPassiveDays) + Number(manBlockedDays) || 1)) * 100}%` }}
                        className="bg-rose-500 h-full"
                        title="Blocked"
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[9px] font-mono text-text-tertiary uppercase block">Liability Ratio</span>
                      <span className="text-lg font-mono text-text-primary">{currentMetric.liabilityRatio}%</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-mono text-text-tertiary uppercase block">Total Duration</span>
                      <span className="text-lg font-mono text-text-primary">
                        {(Number(manActiveDays) + Number(manPassiveDays) + Number(manBlockedDays)).toFixed(1)}d
                      </span>
                    </div>
                  </div>

                  {currentMetric.liabilityRatio > 30 && (
                    <div className="mt-3 p-2 bg-amber-950/20 border border-amber-500/10 text-[10px] font-mono text-amber-300">
                      External blocker latency represents more than 30% of lifecycle duration, indicating high client liability.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Timeline Shift Ledger & Logging */}
              <div className="space-y-6 text-left">
                <div>
                  <h4 className="text-[10px] font-sans text-text-secondary uppercase tracking-wide mb-3">Timeline Shift Ledger</h4>
                  
                  {/* Ledger Audit Trail List */}
                  <div className="bg-[var(--pm-surface)]/5 border border-border p-4 rounded-sm max-h-[160px] overflow-y-auto space-y-2.5 mb-4">
                    {timelineShiftLedger.filter((e: any) => e.projectId === project.id).length === 0 ? (
                      <p className="text-[10px] font-mono text-text-tertiary italic text-center py-4">
                        No timeline shifts logged. Delivery path matches estimation baseline.
                      </p>
                    ) : (
                      timelineShiftLedger
                        .filter((e: any) => e.projectId === project.id)
                        .map((event: any) => (
                          <div key={event.id} className="border-b border-border-subtle pb-2 last:border-0 last:pb-0">
                            <div className="flex justify-between items-start mb-1">
                              <span className="bg-rose-950/40 text-rose-400 border border-rose-500/15 px-1 py-0.5 rounded-sm text-[8px] font-mono font-bold">
                                +{event.deltaDays} DAYS
                              </span>
                              <span className="text-[9px] font-mono text-text-tertiary">
                                {new Date(event.timestamp).toLocaleDateString('en-GB')}
                              </span>
                            </div>
                            <div className="flex gap-1.5 flex-wrap items-center mb-1 text-[8px] font-mono">
                              <span className="text-text-secondary uppercase font-bold">{event.blockerCategory}</span>
                              <span className="text-text-tertiary">·</span>
                              <span className="text-text-secondary uppercase font-bold">Owner: {event.ownership}</span>
                            </div>
                            <p className="text-[10px] font-mono text-text-secondary leading-tight italic">
                              "{event.reason}"
                            </p>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* Log Timeline Shift Form */}
                <div className="bg-[var(--pm-surface)]/5 border border-border p-4 rounded-sm space-y-3">
                  <h5 className="text-[10px] font-sans text-text-secondary uppercase tracking-wide">Log Defensive Timeline Shift</h5>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] uppercase font-mono text-text-secondary mb-1">Delta Shift (Days)</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={deltaDays}
                        onChange={e => setDeltaDays(e.target.value)}
                        className="w-full bg-bg border border-border h-8 px-2 font-mono text-xs focus:border-white/40 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] uppercase font-mono text-text-secondary mb-1">Ownership</label>
                      <select
                        value={blockerOwnership}
                        onChange={e => setBlockerOwnership(e.target.value)}
                        className="w-full bg-bg border border-border h-8 px-2 font-mono text-xs focus:border-white/40 outline-none"
                      >
                        <option value="Client">Client</option>
                        <option value="Internal">Internal</option>
                        <option value="Third-Party Vendor">Third-Party</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase font-mono text-text-secondary mb-1">Blocker Category</label>
                    <select
                      value={blockerCategory}
                      onChange={e => setBlockerCategory(e.target.value)}
                      className="w-full bg-bg border border-border h-8 px-2 font-mono text-xs focus:border-white/40 outline-none"
                    >
                      <option value="Client IT Team">Client IT Team</option>
                      <option value="Infrastructure Readiness">Infrastructure Readiness</option>
                      <option value="Client-owned approvals">Client-owned approvals</option>
                      <option value="Data provisions">Data provisions</option>
                      <option value="Environment mismatch">Environment mismatch</option>
                      <option value="External Latency">External Latency</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase font-mono text-text-secondary mb-1">Attribution Reason & Notes</label>
                    <textarea
                      required
                      value={blockerReason}
                      onChange={e => setBlockerReason(e.target.value)}
                      className="w-full bg-bg border border-border p-2 font-mono text-xs focus:border-white/40 outline-none min-h-[60px]"
                      placeholder="Specify reasoning for defensive audit records..."
                    />
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      const fakeForm = {
                        preventDefault: () => {}
                      } as any;
                      handleAddShiftEvent(fakeForm);
                    }}
                    className="w-full bg-[var(--pm-surface)] text-[var(--pm-text)] h-9 text-[10px] uppercase font-bold tracking-wide hover:bg-neutral-200 transition-all"
                  >
                    Commit Defensive Shift to Ledger
                  </button>
                </div>
              </div>
            </div>
          ) : activeTab === 'files' ? (
            <div className="mt-4">
              <FilePanel 
                entityType="project"
                entityId={project.id}
                currentUserId={currentUserProfile?.id || ''}
                canEdit={true}
              />
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
