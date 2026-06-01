import React, { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOperationalData } from '../../context/OperationalDataContext';
import { hasCapability } from '../../core/auth/permissions';
import { 
  calculateCoordinationAnalytics, 
  OperationalDecision, 
  CoordinationEvent, 
  ApprovalChain, 
  EscalationFlow, 
  MitigationAction, 
  OwnershipTransition, 
  ReleaseDecision, 
  OperationalIntervention 
} from '../../core/execution/coordinationEngine';
import { 
  Plus, 
  Check, 
  AlertCircle, 
  Shield, 
  Activity, 
  Users, 
  Clock, 
  Link2, 
  ArrowRight, 
  User, 
  TrendingUp, 
  AlertTriangle, 
  MessageSquare, 
  Zap, 
  FileText,
  UserPlus,
  ThumbsUp,
  X
} from 'lucide-react';
import { FilePanel } from '../../components/common/FilePanel';

export default function DecisionsPage() {
  const { profile } = useAuth();
  const { raw: { projects, tasks, profiles, workspaceSettingsBlob }, updateWorkspaceSettings } = useOperationalData();

  const userRole = profile?.role || 'viewer';
  const userId = profile?.id || '';
  const userName = profile?.full_name || profile?.email?.split('@')[0] || 'Unknown';

  // Permission Checks
  const canCoordinate = hasCapability(userRole, 'manage_projects') || hasCapability(userRole, 'platform_governance');
  const canIntervene = hasCapability(userRole, 'platform_governance');
  const canParticipate = hasCapability(userRole, 'manage_tasks');

  // Modals state
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState<OperationalDecision | null>(null);

  // Form states for Registering a Decision
  const [decTitle, setDecTitle] = useState('');
  const [decType, setDecType] = useState<OperationalDecision['type']>('design_change');
  const [decProjIds, setDecProjIds] = useState<string[]>([]);
  const [decBlockerIds, setDecBlockerIds] = useState<string[]>([]);
  const [decRationale, setDecRationale] = useState('');
  const [decImpact, setDecImpact] = useState('');
  const [decParticipants, setDecParticipants] = useState<string[]>([]);
  const [decSteps, setDecSteps] = useState<Array<'pm' | 'developer' | 'super_admin' | 'viewer'>>(['pm', 'super_admin']);

  // Form states for Coordination Event
  const [evtTitle, setEvtTitle] = useState('');
  const [evtType, setEvtType] = useState<CoordinationEvent['eventType']>('triage');
  const [evtDuration, setEvtDuration] = useState(30);
  const [evtParticipants, setEvtParticipants] = useState<string[]>([]);
  const [evtDecIds, setEvtDecIds] = useState<string[]>([]);
  const [evtBlockerIds, setEvtBlockerIds] = useState<string[]>([]);
  const [evtNotes, setEvtNotes] = useState('');
  const [evtOutcome, setEvtOutcome] = useState('');

  // Secondary interactive states on Detail Panel
  const [newMitigationDesc, setNewMitigationDesc] = useState('');
  const [newMitigationOwner, setNewMitigationOwner] = useState('');
  const [newEscalationNotes, setNewEscalationNotes] = useState('');
  const [newInterventionNotes, setNewInterventionNotes] = useState('');
  const [newInterventionImpact, setNewInterventionImpact] = useState(5);
  const [newTransitionOwner, setNewTransitionOwner] = useState('');
  const [newTransitionReason, setNewTransitionReason] = useState('');

  // Extract from blob
  const decisions = useMemo(() => {
    return (workspaceSettingsBlob?.operational_decisions || []) as OperationalDecision[];
  }, [workspaceSettingsBlob]);

  const events = useMemo(() => {
    return (workspaceSettingsBlob?.coordination_events || []) as CoordinationEvent[];
  }, [workspaceSettingsBlob]);

  const blockers = useMemo(() => {
    return (workspaceSettingsBlob?.execution_blockers || []) as any[];
  }, [workspaceSettingsBlob]);

  const analytics = useMemo(() => {
    return calculateCoordinationAnalytics(decisions, events, blockers.length);
  }, [decisions, events, blockers]);

  // Seeding routine for simulation data
  const handleBootstrapSimulation = async () => {
    const mockDecisions: OperationalDecision[] = [
      {
        id: 'dec-mock-1',
        workspaceId: (workspaceSettingsBlob?.workspace_id as string) || 'ws-default',
        title: 'Scope Adjustment: Defer secondary reporting features',
        type: 'scope_adjustment',
        ownerId: userId,
        ownerName: userName,
        ownerRole: userRole,
        affectedProjectIds: projects.slice(0, 1).map(p => p.id),
        relatedBlockerIds: blockers.slice(0, 1).map(b => b.id),
        rationale: 'Mitigate active database performance bottleneck affecting critical path.',
        approvalStatus: 'approved',
        approvalChain: {
          id: 'ac-1',
          steps: [
            { role: 'pm', status: 'approved', approverName: 'Project Manager', timestamp: new Date().toISOString() },
            { role: 'super_admin', status: 'approved', approverName: 'Super Admin', timestamp: new Date().toISOString() }
          ],
          currentStepIndex: 2
        },
        mitigationActions: [
          {
            id: 'mit-1',
            ownerId: userId,
            ownerName: userName,
            description: 'Implement simplified analytics payload mock logic',
            expectedResolution: new Date(Date.now() + 2 * 86400000).toISOString(),
            status: 'completed',
            actualResolution: new Date().toISOString()
          }
        ],
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
        participants: [userName, 'Lead Developer'],
        downstreamImpactDesc: 'Stabilizes core app latency, shifts secondary report release to next sprint.'
      },
      {
        id: 'dec-mock-2',
        workspaceId: (workspaceSettingsBlob?.workspace_id as string) || 'ws-default',
        title: 'Timeline Recalibration: Relocate API resources due to blocker propagation',
        type: 'timeline_recalibration',
        ownerId: userId,
        ownerName: userName,
        ownerRole: userRole,
        affectedProjectIds: projects.slice(0, 1).map(p => p.id),
        relatedBlockerIds: blockers.slice(1, 2).map(b => b.id),
        rationale: 'Active deployment blocker blocks downstream validation cycles.',
        approvalStatus: 'escalated',
        escalationHistory: [
          {
            id: 'esc-1',
            escalatedById: userId,
            escalatedByName: userName,
            escalatedToRole: 'super_admin',
            timestamp: new Date().toISOString(),
            status: 'active',
            notes: 'Requires super-admin intervention for cross-sprint server allocation.'
          }
        ],
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
        participants: [userName],
        downstreamImpactDesc: 'Extends integration deadline by 3 days but guarantees deployment access.'
      }
    ];

    const mockEvents: CoordinationEvent[] = [
      {
        id: 'evt-mock-1',
        workspaceId: (workspaceSettingsBlob?.workspace_id as string) || 'ws-default',
        title: 'Urgent Triage & Resource Allocation Sync',
        eventType: 'triage',
        timestamp: new Date(Date.now() - 2 * 86400000).toISOString(),
        durationMinutes: 45,
        participants: [userName, 'Lead Developer', 'QA Lead'],
        decisionIds: ['dec-mock-1'],
        blockerIds: blockers.slice(0, 1).map(b => b.id),
        notes: 'Reviewed current database performance parameters and aligned on mitigation strategy.',
        latencyHours: 4,
        operationalOutcome: 'Scope adjustment decision approved, mitigation action registered.'
      }
    ];

    await updateWorkspaceSettings({
      operational_decisions: mockDecisions,
      coordination_events: mockEvents
    });
  };

  const handleSaveDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decTitle || !decRationale) return;

    const newDec: OperationalDecision = {
      id: `dec-${Date.now()}`,
      workspaceId: (workspaceSettingsBlob?.workspace_id as string) || 'ws-default',
      title: decTitle,
      type: decType,
      ownerId: userId,
      ownerName: userName,
      ownerRole: userRole,
      affectedProjectIds: decProjIds,
      relatedBlockerIds: decBlockerIds,
      rationale: decRationale,
      approvalStatus: decSteps.length > 0 ? 'pending_approval' : 'approved',
      approvalChain: decSteps.length > 0 ? {
        id: `ac-${Date.now()}`,
        steps: decSteps.map(role => ({
          role,
          status: 'pending'
        })),
        currentStepIndex: 0
      } : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      participants: decParticipants,
      downstreamImpactDesc: decImpact
    };

    const updated = [newDec, ...decisions];
    await updateWorkspaceSettings({ operational_decisions: updated });

    // Reset Form
    setDecTitle('');
    setDecRationale('');
    setDecImpact('');
    setDecProjIds([]);
    setDecBlockerIds([]);
    setDecParticipants([]);
    setIsDecisionModalOpen(false);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evtTitle || !evtOutcome) return;

    const newEvt: CoordinationEvent = {
      id: `evt-${Date.now()}`,
      workspaceId: (workspaceSettingsBlob?.workspace_id as string) || 'ws-default',
      title: evtTitle,
      eventType: evtType,
      timestamp: new Date().toISOString(),
      durationMinutes: Number(evtDuration),
      participants: evtParticipants,
      decisionIds: evtDecIds,
      blockerIds: evtBlockerIds,
      notes: evtNotes,
      operationalOutcome: evtOutcome
    };

    const updated = [newEvt, ...events];
    await updateWorkspaceSettings({ coordination_events: updated });

    setEvtTitle('');
    setEvtOutcome('');
    setEvtNotes('');
    setEvtDecIds([]);
    setEvtBlockerIds([]);
    setEvtParticipants([]);
    setIsEventModalOpen(false);
  };

  const handleUpdateDecisionStatus = async (decId: string, status: OperationalDecision['approvalStatus']) => {
    const updated = decisions.map(d => {
      if (d.id === decId) {
        return { ...d, approvalStatus: status, updatedAt: new Date().toISOString() };
      }
      return d;
    });
    await updateWorkspaceSettings({ operational_decisions: updated });
    // Update active panel context
    const current = updated.find(d => d.id === decId);
    if (current) setSelectedDecision(current);
  };

  const handleApproveStep = async (decId: string, stepIndex: number) => {
    const updated = decisions.map(d => {
      if (d.id === decId && d.approvalChain) {
        const steps = [...d.approvalChain.steps];
        steps[stepIndex] = {
          ...steps[stepIndex],
          status: 'approved',
          approverId: userId,
          approverName: userName,
          timestamp: new Date().toISOString()
        };
        const nextIndex = stepIndex + 1;
        const allApproved = nextIndex >= steps.length;
        return {
          ...d,
          approvalStatus: allApproved ? 'approved' : d.approvalStatus,
          approvalChain: {
            ...d.approvalChain,
            steps,
            currentStepIndex: nextIndex
          },
          updatedAt: new Date().toISOString()
        };
      }
      return d;
    });
    await updateWorkspaceSettings({ operational_decisions: updated });
    const current = updated.find(d => d.id === decId);
    if (current) setSelectedDecision(current);
  };

  const handleAddMitigation = async (decId: string) => {
    if (!newMitigationDesc || !newMitigationOwner) return;

    const profileOwner = profiles.find((p: any) => p.id === newMitigationOwner);
    const ownerName = profileOwner?.full_name || profileOwner?.email || 'Unknown';

    const newMit: MitigationAction = {
      id: `mit-${Date.now()}`,
      ownerId: newMitigationOwner,
      ownerName,
      description: newMitigationDesc,
      expectedResolution: new Date(Date.now() + 3 * 86400000).toISOString(),
      status: 'identified'
    };

    const updated = decisions.map(d => {
      if (d.id === decId) {
        return {
          ...d,
          mitigationActions: [...(d.mitigationActions || []), newMit],
          updatedAt: new Date().toISOString()
        };
      }
      return d;
    });
    await updateWorkspaceSettings({ operational_decisions: updated });
    const current = updated.find(d => d.id === decId);
    if (current) setSelectedDecision(current);

    setNewMitigationDesc('');
  };

  const handleResolveMitigation = async (decId: string, mitId: string, success: boolean) => {
    const updated = decisions.map(d => {
      if (d.id === decId && d.mitigationActions) {
        const mitigations = d.mitigationActions.map(m => {
          if (m.id === mitId) {
            return {
              ...m,
              status: success ? 'completed' : 'failed' as any,
              actualResolution: new Date().toISOString()
            };
          }
          return m;
        });
        return { ...d, mitigationActions: mitigations, updatedAt: new Date().toISOString() };
      }
      return d;
    });
    await updateWorkspaceSettings({ operational_decisions: updated });
    const current = updated.find(d => d.id === decId);
    if (current) setSelectedDecision(current);
  };

  const handleTriggerEscalation = async (decId: string) => {
    if (!newEscalationNotes) return;

    const newEsc: EscalationFlow = {
      id: `esc-${Date.now()}`,
      escalatedById: userId,
      escalatedByName: userName,
      escalatedToRole: 'super_admin',
      timestamp: new Date().toISOString(),
      status: 'active',
      notes: newEscalationNotes
    };

    const updated = decisions.map(d => {
      if (d.id === decId) {
        return {
          ...d,
          approvalStatus: 'escalated' as any,
          escalationHistory: [...(d.escalationHistory || []), newEsc],
          updatedAt: new Date().toISOString()
        };
      }
      return d;
    });
    await updateWorkspaceSettings({ operational_decisions: updated });
    const current = updated.find(d => d.id === decId);
    if (current) setSelectedDecision(current);

    setNewEscalationNotes('');
  };

  const handleAddIntervention = async (decId: string) => {
    if (!newInterventionNotes) return;

    const newIntv: OperationalIntervention = {
      id: `intv-${Date.now()}`,
      intervenedById: userId,
      intervenedByName: userName,
      actionTaken: newInterventionNotes,
      impactScore: Number(newInterventionImpact),
      timestamp: new Date().toISOString(),
      rationale: 'Administrative operational intervention'
    };

    const updated = decisions.map(d => {
      if (d.id === decId) {
        return {
          ...d,
          operationalInterventions: [...(d.operationalInterventions || []), newIntv],
          updatedAt: new Date().toISOString()
        };
      }
      return d;
    });
    await updateWorkspaceSettings({ operational_decisions: updated });
    const current = updated.find(d => d.id === decId);
    if (current) setSelectedDecision(current);

    setNewInterventionNotes('');
  };

  const handleAddOwnershipTransition = async (decId: string, taskId: string) => {
    if (!newTransitionOwner || !newTransitionReason) return;

    const pOwner = profiles.find((p: any) => p.id === newTransitionOwner);
    const newOwnerName = pOwner?.full_name || pOwner?.email || 'Unknown';

    const taskObj = tasks.find((t: any) => t.id === taskId);
    const previousOwnerId = taskObj?.assignee_id || 'unassigned';
    const prevProfile = profiles.find((p: any) => p.id === previousOwnerId);
    const previousOwnerName = prevProfile?.full_name || prevProfile?.email || 'Unassigned';

    const newTrans: OwnershipTransition = {
      id: `trans-${Date.now()}`,
      taskId,
      previousOwnerId,
      previousOwnerName,
      newOwnerId: newTransitionOwner,
      newOwnerName,
      reason: newTransitionReason,
      timestamp: new Date().toISOString()
    };

    // Apply the task assignee update directly in Database
    if (taskActions?.updateTask) {
      await taskActions.updateTask(taskId, { assignee_id: newTransitionOwner });
    }

    const updated = decisions.map(d => {
      if (d.id === decId) {
        return {
          ...d,
          ownershipTransitions: [...(d.ownershipTransitions || []), newTrans],
          updatedAt: new Date().toISOString()
        };
      }
      return d;
    });
    await updateWorkspaceSettings({ operational_decisions: updated });
    const current = updated.find(d => d.id === decId);
    if (current) setSelectedDecision(current);

    setNewTransitionOwner('');
    setNewTransitionReason('');
  };

  const { taskActions } = useOperationalData();

  return (
    <div className="flex flex-col gap-6 pb-12 font-geist" style={{ color: 'var(--pm-on-surface)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">Decisions</h1>
          <p className="text-sm mt-0.5 text-text-tertiary">
            Track approvals, mitigate risks, and manage cross-functional decisions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {decisions.length === 0 && (
            <button
              onClick={handleBootstrapSimulation}
              className="px-3 py-1.5 bg-accent-primary/15 border border-accent-primary/25 rounded-lg text-[10px] font-bold uppercase tracking-wider text-accent-primary hover:bg-accent-primary/20 transition-all"
            >
              Seed Simulator Data
            </button>
          )}
          {canCoordinate && (
            <>
              <button
                onClick={() => setIsDecisionModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-teal-500 rounded-xl text-xs font-bold uppercase tracking-wider text-[var(--pm-text)] dark:text-white hover:from-blue-500 hover:to-teal-400 shadow-lg hover:shadow-teal-500/25 transition-all"
              >
                <Plus className="w-4 h-4" /> Register Decision
              </button>
              <button
                onClick={() => setIsEventModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 border border-border/50 bg-surface-3/50 hover:bg-surface-3 rounded-xl text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" /> Log Sync Meeting
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Indicators Panel */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: 'Coordination Overhead', value: `${analytics.coordinationOverheadMinutes}m`, desc: 'Meeting durations' },
          { label: 'Avg Approval Latency', value: `${analytics.averageApprovalLatencyHours}h`, desc: 'Time to resolve decision' },
          { label: 'Escalation Frequency', value: `${Math.round(analytics.escalationFrequencyRatio * 100)}%`, desc: 'Ratio of escalations to blockers' },
          { label: 'Mitigation Effectiveness', value: `${Math.round(analytics.mitigationEffectivenessRatio * 100)}%`, desc: 'Completed actions ratio' },
          { label: 'Ownership Churn', value: `${analytics.ownershipChurnCount}`, desc: 'Total assignee handoffs' },
          { label: 'Intervention Impact', value: `${analytics.averageInterventionImpact > 0 ? '+' : ''}${analytics.averageInterventionImpact}`, desc: 'Admin intervention score' },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-surface-3/50 backdrop-blur-md border border-border/50 p-5 rounded-2xl text-center shadow-sm hover:shadow-md transition-shadow">
            <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest block mb-2">{kpi.label}</span>
            <span className="text-2xl font-bold bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent block">{kpi.value}</span>
            <span className="text-[10px] text-text-quaternary font-bold block mt-2">{kpi.desc}</span>
          </div>
        ))}
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Decisions Stream */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="bg-surface-3/50 backdrop-blur-md border border-border/50 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent-primary" />
                <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">Operational Decisions Registry</h2>
              </div>
              <span className="text-[10px] font-bold text-text-tertiary">{decisions.length} Decisions Logged</span>
            </div>

            {decisions.length === 0 ? (
              <div className="text-center py-12 text-text-quaternary text-xs font-mono uppercase">
                No active decisions registered. Click simulator or create above.
              </div>
            ) : (
              <div className="space-y-4">
                {decisions.map(dec => {
                  const statusColors = {
                    draft: 'border-text-quaternary/20 text-text-secondary bg-surface-3',
                    pending_approval: 'border-amber-500/20 text-amber-500 bg-amber-500/5',
                    approved: 'border-signal-safe/20 text-signal-safe bg-signal-safe/5',
                    rejected: 'border-signal-critical/20 text-signal-critical bg-signal-critical/5',
                    escalated: 'border-rose-500/20 text-rose-500 bg-rose-500/5'
                  };
                  const currentStyle = statusColors[dec.approvalStatus] || statusColors.draft;

                  return (
                    <div 
                      key={dec.id} 
                      onClick={() => setSelectedDecision(dec)}
                      className={`border p-4 rounded-xl cursor-pointer hover:border-accent-primary/40 transition-all ${
                        selectedDecision?.id === dec.id ? 'bg-surface border-accent-primary' : 'bg-surface/50 border-border-subtle'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${currentStyle}`}>
                          {dec.approvalStatus.replace('_', ' ')}
                        </span>
                        <span className="text-[9px] text-text-tertiary font-medium">{new Date(dec.createdAt).toLocaleDateString()}</span>
                      </div>
                      <h3 className="text-sm font-bold text-text-primary leading-snug">{dec.title}</h3>
                      <p className="text-xs text-text-secondary line-clamp-2 mt-1">{dec.rationale}</p>
                      
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border-subtle/50 text-[10px] text-text-tertiary font-medium uppercase tracking-tight">
                        <span>Type: {dec.type.replace('_', ' ')}</span>
                        <span>Owner: {dec.ownerName}</span>
                        {dec.mitigationActions && (
                          <span className="ml-auto text-accent-secondary font-bold">
                            {dec.mitigationActions.filter(m => m.status === 'completed').length} / {dec.mitigationActions.length} Mitigations Done
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Execution Sync & Details */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          {/* Decision Detail & Action console */}
          {selectedDecision ? (
            <div className="bg-surface-3/50 backdrop-blur-md border border-border/50 p-6 rounded-2xl shadow-sm flex flex-col gap-6">
              <div className="flex items-start justify-between border-b border-border pb-3">
                <div>
                  <span className="text-[8px] font-mono text-text-quaternary uppercase tracking-widest">{selectedDecision.id}</span>
                  <h2 className="text-sm font-bold text-text-primary leading-tight mt-0.5">{selectedDecision.title}</h2>
                </div>
                <button onClick={() => setSelectedDecision(null)} className="text-text-tertiary hover:text-text-primary">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Rationale & Impact */}
              <div>
                <span className="text-[9px] font-bold text-text-tertiary uppercase tracking-widest block mb-1">Rationale</span>
                <p className="text-xs text-text-secondary leading-relaxed bg-surface-2 p-2.5 rounded border border-border-subtle">{selectedDecision.rationale}</p>
              </div>

              {selectedDecision.downstreamImpactDesc && (
                <div>
                  <span className="text-[9px] font-bold text-text-tertiary uppercase tracking-widest block mb-1">Downstream Operational Impact</span>
                  <p className="text-xs text-text-secondary leading-relaxed bg-surface-2 p-2.5 rounded border border-border-subtle">{selectedDecision.downstreamImpactDesc}</p>
                </div>
              )}

              {/* Approval workflow step-by-step progress */}
              {selectedDecision.approvalChain && (
                <div>
                  <span className="text-[9px] font-bold text-text-tertiary uppercase tracking-widest block mb-2">Approval Chain Workflow</span>
                  <div className="space-y-2">
                    {selectedDecision.approvalChain.steps.map((step, idx) => {
                      const isPending = step.status === 'pending';
                      const isCurrentStep = idx === selectedDecision.approvalChain!.currentStepIndex;
                      const userHasAuthority = userRole === step.role || userRole === 'super_admin';

                      return (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-surface-2 border border-border-subtle">
                          <div className="flex items-center gap-2">
                            {step.status === 'approved' ? (
                              <Check className="w-3.5 h-3.5 text-signal-safe" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 text-text-quaternary" />
                            )}
                            <span className="text-xs font-bold text-text-secondary uppercase">Step {idx + 1}: {step.role} Approval</span>
                            {step.approverName && (
                              <span className="text-[10px] text-text-tertiary">({step.approverName})</span>
                            )}
                          </div>
                          {isPending && isCurrentStep && userHasAuthority && canCoordinate && (
                            <button
                              onClick={() => handleApproveStep(selectedDecision.id, idx)}
                              className="px-2 py-1 bg-signal-safe text-[var(--pm-text)] dark:text-white text-[9px] font-bold uppercase rounded hover:brightness-115"
                            >
                              Approve
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Ownership Transitions */}
              {canCoordinate && selectedDecision.affectedProjectIds.length > 0 && (
                <div>
                  <span className="text-[9px] font-bold text-text-tertiary uppercase tracking-widest block mb-2">Assignee Ownership Transitions</span>
                  <div className="flex gap-2">
                    <select
                      value={newTransitionOwner}
                      onChange={e => setNewTransitionOwner(e.target.value)}
                      className="bg-surface-2 border border-border rounded p-1.5 text-xs text-text-secondary flex-1"
                    >
                      <option value="">Select Assignee</option>
                      {profiles.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Reason for reassignment"
                      value={newTransitionReason}
                      onChange={e => setNewTransitionReason(e.target.value)}
                      className="bg-surface-2 border border-border rounded p-1.5 text-xs text-text-secondary flex-1"
                    />
                    <button
                      onClick={() => {
                        const projectTasks = tasks.filter((t: any) => t.project_id === selectedDecision.affectedProjectIds[0]);
                        if (projectTasks.length > 0) {
                          handleAddOwnershipTransition(selectedDecision.id, projectTasks[0].id);
                        }
                      }}
                      className="px-3 py-1 bg-accent-primary text-[var(--pm-text)] dark:text-white text-[9px] font-bold uppercase rounded hover:brightness-110"
                    >
                      Reassign
                    </button>
                  </div>
                  {selectedDecision.ownershipTransitions && selectedDecision.ownershipTransitions.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {selectedDecision.ownershipTransitions.map((t, idx) => (
                        <div key={idx} className="text-[10px] text-text-secondary p-1.5 bg-surface-2 rounded border border-border-subtle">
                          Task Owner transitioned from <span className="font-bold">{t.previousOwnerName}</span> to <span className="font-bold">{t.newOwnerName}</span>. Rationale: <span className="italic">"{t.reason}"</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Mitigation coordination action planner */}
              <div>
                <span className="text-[9px] font-bold text-text-tertiary uppercase tracking-widest block mb-2">Mitigation Action Plan</span>
                {canCoordinate && (
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      placeholder="Identify mitigation description"
                      value={newMitigationDesc}
                      onChange={e => setNewMitigationDesc(e.target.value)}
                      className="bg-surface-2 border border-border rounded p-1.5 text-xs text-text-secondary flex-1"
                    />
                    <select
                      value={newMitigationOwner}
                      onChange={e => setNewMitigationOwner(e.target.value)}
                      className="bg-surface-2 border border-border rounded p-1.5 text-xs text-text-secondary w-32"
                    >
                      <option value="">Owner</option>
                      {profiles.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAddMitigation(selectedDecision.id)}
                      className="px-3 py-1 bg-accent-primary text-[var(--pm-text)] dark:text-white text-[9px] font-bold uppercase rounded hover:brightness-110"
                    >
                      Add Action
                    </button>
                  </div>
                )}
                <div className="space-y-2">
                  {selectedDecision.mitigationActions?.map((mit) => {
                    const isOwner = mit.ownerId === userId;

                    return (
                      <div key={mit.id} className="p-3 bg-surface-2 rounded-lg border border-border-subtle flex items-center justify-between">
                        <div>
                          <p className="text-xs text-text-primary font-semibold leading-tight">{mit.description}</p>
                          <span className="text-[9px] text-text-tertiary">Owner: {mit.ownerName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                            mit.status === 'completed' ? 'border-signal-safe/20 text-signal-safe bg-signal-safe/5' :
                            mit.status === 'failed' ? 'border-signal-critical/20 text-signal-critical bg-signal-critical/5' :
                            'border-amber-500/20 text-amber-500 bg-amber-500/5'
                          }`}>
                            {mit.status}
                          </span>
                          {mit.status === 'identified' && (canParticipate && isOwner) && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleResolveMitigation(selectedDecision.id, mit.id, true)}
                                className="p-1 bg-signal-safe rounded text-[var(--pm-text)] dark:text-white"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleResolveMitigation(selectedDecision.id, mit.id, false)}
                                className="p-1 bg-signal-critical rounded text-[var(--pm-text)] dark:text-white"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Escalations block */}
              <div>
                <span className="text-[9px] font-bold text-text-tertiary uppercase tracking-widest block mb-2">Escalation Chains</span>
                {canCoordinate && selectedDecision.approvalStatus !== 'approved' && (
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      placeholder="Escalate decision rationale"
                      value={newEscalationNotes}
                      onChange={e => setNewEscalationNotes(e.target.value)}
                      className="bg-surface-2 border border-border rounded p-1.5 text-xs text-text-secondary flex-1"
                    />
                    <button
                      onClick={() => handleTriggerEscalation(selectedDecision.id)}
                      className="px-3 py-1 bg-rose-500 text-[var(--pm-text)] dark:text-white text-[9px] font-bold uppercase rounded hover:brightness-110"
                    >
                      Escalate
                    </button>
                  </div>
                )}
                {selectedDecision.escalationHistory && selectedDecision.escalationHistory.length > 0 && (
                  <div className="space-y-2">
                    {selectedDecision.escalationHistory.map((esc, idx) => (
                      <div key={idx} className="p-2.5 bg-rose-500/5 border border-rose-500/20 rounded-lg text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-rose-400">Escalated to {esc.escalatedToRole}</span>
                          <span className="text-[9px] text-text-tertiary">{new Date(esc.timestamp).toLocaleDateString()}</span>
                        </div>
                        <p className="text-text-secondary italic">"{esc.notes}"</p>
                        <span className="text-[9px] text-text-tertiary mt-1 block">Escalated by: {esc.escalatedByName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Super Admin interventions */}
              <div>
                <span className="text-[9px] font-bold text-text-tertiary uppercase tracking-widest block mb-2">Operational Interventions</span>
                {canIntervene && (
                  <div className="flex flex-col gap-2 mb-3 bg-surface-2 p-3 rounded-lg border border-border-subtle">
                    <input
                      type="text"
                      placeholder="Describe intervention action..."
                      value={newInterventionNotes}
                      onChange={e => setNewInterventionNotes(e.target.value)}
                      className="bg-surface border border-border rounded p-1.5 text-xs text-text-secondary"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-text-secondary">Expected Impact:</span>
                      <input
                        type="range"
                        min="-10"
                        max="10"
                        value={newInterventionImpact}
                        onChange={e => setNewInterventionImpact(Number(e.target.value))}
                        className="w-32"
                      />
                      <span className="text-xs font-bold text-accent-primary">{newInterventionImpact}</span>
                      <button
                        onClick={() => handleAddIntervention(selectedDecision.id)}
                        className="px-3 py-1.5 bg-purple-600 text-[var(--pm-text)] dark:text-white text-[9px] font-bold uppercase rounded hover:brightness-110"
                      >
                        Intervene
                      </button>
                    </div>
                  </div>
                )}
                {selectedDecision.operationalInterventions && selectedDecision.operationalInterventions.length > 0 && (
                  <div className="space-y-2">
                    {selectedDecision.operationalInterventions.map((intv, idx) => (
                      <div key={idx} className="p-2.5 bg-purple-500/5 border border-purple-500/20 rounded-lg text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-purple-400">Intervention (Impact: {intv.impactScore})</span>
                          <span className="text-[9px] text-text-tertiary">{new Date(intv.timestamp).toLocaleDateString()}</span>
                        </div>
                        <p className="text-text-secondary italic">"{intv.actionTaken}"</p>
                        <span className="text-[9px] text-text-tertiary mt-1 block">Intervened by: {intv.intervenedByName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Files panel for decision */}
              <div className="mt-2">
                <FilePanel 
                  entityType="decision"
                  entityId={selectedDecision.id}
                  currentUserId={userId}
                  canEdit={canCoordinate}
                />
              </div>
            </div>
          ) : (
            <div className="bg-surface-2 border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4 border-b border-border pb-3">
                <Users className="w-4 h-4 text-accent-secondary" />
                <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">Sync &amp; Coordination Logs</h2>
              </div>

              {events.length === 0 ? (
                <div className="text-center py-12 text-text-quaternary text-xs font-mono uppercase">
                  No coordination sync meetings logged.
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map(evt => (
                    <div key={evt.id} className="p-3.5 bg-surface border border-border-subtle rounded-lg">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-text-primary">{evt.title}</span>
                        <span className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">{evt.eventType}</span>
                      </div>
                      <p className="text-xs text-text-secondary">{evt.notes}</p>
                      <div className="mt-2 text-[10px] text-text-quaternary font-bold uppercase tracking-wider border-t border-border-subtle/50 pt-2 flex justify-between">
                        <span>Duration: {evt.durationMinutes}m</span>
                        <span>Outcome: {evt.operationalOutcome}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Register Decision Modal */}
      {isDecisionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-bg/80 backdrop-blur-md" onClick={() => setIsDecisionModalOpen(false)} />
          <div className="relative bg-surface/80 backdrop-blur-xl border border-border/50 rounded-2xl w-full max-w-lg p-8 shadow-2xl shadow-black/50 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-teal-500 to-emerald-500 rounded-t-2xl z-50" />
            <div className="flex justify-between items-center border-b border-border/50 pb-4">
              <h3 className="text-lg font-bold tracking-tight text-text-primary">Register Operational Decision</h3>
              <button onClick={() => setIsDecisionModalOpen(false)} className="p-2 border border-border/50 rounded-xl hover:bg-surface-3 transition-colors text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDecision} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text-tertiary uppercase">Decision Title</label>
                <input
                  type="text"
                  required
                  placeholder="Scope adjustment, design deferral etc."
                  value={decTitle}
                  onChange={e => setDecTitle(e.target.value)}
                  className="bg-surface border border-border rounded p-2 text-xs text-text-secondary focus:border-accent-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text-tertiary uppercase">Decision Type</label>
                  <select
                    value={decType}
                    onChange={e => setDecType(e.target.value as any)}
                    className="bg-surface border border-border rounded p-2 text-xs text-text-secondary"
                  >
                    <option value="design_change">Design Change</option>
                    <option value="scope_adjustment">Scope Adjustment</option>
                    <option value="timeline_recalibration">Timeline Recalibration</option>
                    <option value="resource_reallocation">Resource Reallocation</option>
                    <option value="escalation_resolution">Escalation Resolution</option>
                    <option value="infra_approval">Infrastructure Approval</option>
                    <option value="release_authorization">Release Authorization</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text-tertiary uppercase">Affected Project</label>
                  <select
                    multiple
                    value={decProjIds}
                    onChange={e => setDecProjIds(Array.from(e.target.selectedOptions, option => option.value))}
                    className="bg-surface border border-border rounded p-2 text-xs text-text-secondary h-20"
                  >
                    {projects.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text-tertiary uppercase">Related Blocker</label>
                <select
                  multiple
                  value={decBlockerIds}
                  onChange={e => setDecBlockerIds(Array.from(e.target.selectedOptions, option => option.value))}
                  className="bg-surface border border-border rounded p-2 text-xs text-text-secondary h-16"
                >
                  {blockers.map((b: any) => {
                    const taskName = tasks.find((t: any) => t.id === b.task_id)?.name || 'Task';
                    return (
                      <option key={b.id} value={b.id}>[{b.category}] {taskName}: {b.description}</option>
                    );
                  })}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text-tertiary uppercase">Decision Rationale (Why changed?)</label>
                <textarea
                  required
                  placeholder="Detail the operational why behind this decision..."
                  value={decRationale}
                  onChange={e => setDecRationale(e.target.value)}
                  className="bg-surface border border-border rounded p-2 text-xs text-text-secondary h-20 resize-none focus:border-accent-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text-tertiary uppercase">Downstream Operational Impact</label>
                <input
                  type="text"
                  placeholder="Expected drift mitigations, release changes"
                  value={decImpact}
                  onChange={e => setDecImpact(e.target.value)}
                  className="bg-surface border border-border rounded p-2 text-xs text-text-secondary focus:border-accent-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text-tertiary uppercase">Approval Workflow Steps</label>
                <div className="flex items-center gap-4 text-xs mt-1">
                  {[
                    { role: 'pm', label: 'PM' },
                    { role: 'developer', label: 'Lead Developer' },
                    { role: 'super_admin', label: 'Super Admin' }
                  ].map((step) => {
                    const isSelected = decSteps.includes(step.role as any);
                    return (
                      <label key={step.role} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            if (isSelected) {
                              setDecSteps(decSteps.filter(r => r !== step.role));
                            } else {
                              setDecSteps([...decSteps, step.role as any]);
                            }
                          }}
                          className="rounded border-border text-accent-primary focus:ring-0"
                        />
                        <span>{step.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end pt-3 border-t border-border mt-4">
                <button
                  type="button"
                  onClick={() => setIsDecisionModalOpen(false)}
                  className="px-4 py-2 border border-border rounded-lg text-xs font-bold uppercase text-text-secondary hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-accent-primary text-[var(--pm-text)] dark:text-white text-xs font-bold uppercase rounded-lg hover:brightness-110"
                >
                  Save Decision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Sync Meeting Modal */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-bg/80 backdrop-blur-md" onClick={() => setIsEventModalOpen(false)} />
          <div className="relative bg-surface/80 backdrop-blur-xl border border-border/50 rounded-2xl w-full max-w-md p-8 shadow-2xl shadow-black/50 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-teal-500 to-emerald-500 rounded-t-2xl z-50" />
            <div className="flex justify-between items-center border-b border-border/50 pb-4">
              <h3 className="text-lg font-bold tracking-tight text-text-primary">Log Coordination Sync Meeting</h3>
              <button onClick={() => setIsEventModalOpen(false)} className="p-2 border border-border/50 rounded-xl hover:bg-surface-3 transition-colors text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text-tertiary uppercase">Meeting Title</label>
                <input
                  type="text"
                  required
                  placeholder="Daily standup blocker triage, release gate review"
                  value={evtTitle}
                  onChange={e => setEvtTitle(e.target.value)}
                  className="bg-surface border border-border rounded p-2 text-xs text-text-secondary focus:border-accent-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text-tertiary uppercase">Meeting Type</label>
                  <select
                    value={evtType}
                    onChange={e => setEvtType(e.target.value as any)}
                    className="bg-surface border border-border rounded p-2 text-xs text-text-secondary"
                  >
                    <option value="triage">Blocker Triage</option>
                    <option value="escalation">Escalation Review</option>
                    <option value="approval_review">Approval Review</option>
                    <option value="mitigation_sync">Mitigation Sync</option>
                    <option value="release_gate">Release Gate</option>
                    <option value="intervention">Operational Intervention</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text-tertiary uppercase">Duration (Minutes)</label>
                  <input
                    type="number"
                    required
                    value={evtDuration}
                    onChange={e => setEvtDuration(Number(e.target.value))}
                    className="bg-surface border border-border rounded p-2 text-xs text-text-secondary focus:border-accent-primary"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text-tertiary uppercase">Participants</label>
                <select
                  multiple
                  value={evtParticipants}
                  onChange={e => setEvtParticipants(Array.from(e.target.selectedOptions, option => option.text))}
                  className="bg-surface border border-border rounded p-2 text-xs text-text-secondary h-20"
                >
                  {profiles.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text-tertiary uppercase">Resolves Decisions</label>
                <select
                  multiple
                  value={evtDecIds}
                  onChange={e => setEvtDecIds(Array.from(e.target.selectedOptions, option => option.value))}
                  className="bg-surface border border-border rounded p-2 text-xs text-text-secondary h-16"
                >
                  {decisions.map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text-tertiary uppercase">Meeting Notes</label>
                <textarea
                  placeholder="Minutes of meetings, actions discussed..."
                  value={evtNotes}
                  onChange={e => setEvtNotes(e.target.value)}
                  className="bg-surface border border-border rounded p-2 text-xs text-text-secondary h-16 resize-none focus:border-accent-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text-tertiary uppercase">Operational Outcome</label>
                <input
                  type="text"
                  required
                  placeholder="Mitigations assigned, timeline approved"
                  value={evtOutcome}
                  onChange={e => setEvtOutcome(e.target.value)}
                  className="bg-surface border border-border rounded p-2 text-xs text-text-secondary focus:border-accent-primary"
                />
              </div>

              <div className="flex items-center gap-2 justify-end pt-3 border-t border-border mt-4">
                <button
                  type="button"
                  onClick={() => setIsEventModalOpen(false)}
                  className="px-4 py-2 border border-border rounded-lg text-xs font-bold uppercase text-text-secondary hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-accent-primary text-[var(--pm-text)] dark:text-white text-xs font-bold uppercase rounded-lg hover:brightness-110"
                >
                  Log Meeting
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}