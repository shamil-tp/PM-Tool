import React, { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOperationalData } from '../../context/OperationalDataContext';
import { hasCapability } from '../../core/auth/permissions';
import { calculateOrganizationalIntelligence } from '../../core/execution/intelligenceEngine';
import { 
  generateOperationalMemory, 
  OperationalMemory,
  MitigationOutcome,
  ExecutionPatternHistory,
  DeliveryBehaviorProfile,
  CoordinationEffectivenessProfile,
  DependencyReliabilityHistory,
  RecoveryPerformanceProfile,
  OperationalLearningInsight
} from '../../core/execution/learningEngine';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Shield, 
  Target, 
  TrendingUp, 
  Users, 
  Zap, 
  BarChart3, 
  FileText, 
  ArrowRight,
  Info,
  Server,
  Layers,
  Brain,
  History,
  Award,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Sparkles
} from 'lucide-react';

export function ExecutiveAnalytics() {
  const { profile } = useAuth();
  const { raw: { projects, tasks, teams, profiles, workspaceSettingsBlob }, governanceCache } = useOperationalData();

  const userRole = profile?.role || 'viewer';
  const userId = profile?.id || '';

  // Capabilities
  const isSuperAdmin = hasCapability(userRole, 'platform_governance');
  const isPM = hasCapability(userRole, 'manage_projects') && !isSuperAdmin;
  const isDeveloper = hasCapability(userRole, 'manage_tasks') && !hasCapability(userRole, 'manage_projects');
  const isStakeholder = userRole === 'viewer';

  const intel = governanceCache.intelligence;
  const memory = governanceCache.memory;

  // Tab State
  const [activeTab, setActiveTab] = useState<'insights' | 'mitigations' | 'dependencies' | 'teams'>('insights');

  // Role-Aware visibility filters
  const visibleInsights = useMemo(() => {
    if (isSuperAdmin) return memory.learningInsights;
    if (isPM) {
      // PMs see project-level and mitigation-specific insights
      return memory.learningInsights.filter(ins => ins.title.includes('Drift') || ins.title.includes('Mitigation') || ins.title.includes('Coordination'));
    }
    if (isDeveloper) {
      // Developers see dependency and sync overhead insights
      return memory.learningInsights.filter(ins => ins.title.includes('Dependency') || ins.title.includes('Sync') || ins.severity !== 'high');
    }
    // Stakeholders see stability and drift summaries
    return memory.learningInsights.filter(ins => ins.severity === 'high' || ins.title.includes('Drift'));
  }, [memory.learningInsights, isSuperAdmin, isPM, isDeveloper]);

  const visibleTeamProfiles = useMemo(() => {
    if (isSuperAdmin || isPM || isStakeholder) return memory.recoveryProfiles;
    // Developer: only see profiles they are rostered in
    return memory.recoveryProfiles.filter(tp => {
      const teamObj = teams.find(t => t.id === tp.teamId);
      if (!teamObj) return false;
      const pmId = (teamObj.data as any)?.pm_id;
      const devIds = (teamObj.data as any)?.developer_ids || [];
      return devIds.includes(userId) || pmId === userId;
    });
  }, [memory.recoveryProfiles, isSuperAdmin, isPM, isStakeholder, teams, userId]);

  // Global KPIs
  const globalMetrics = useMemo(() => {
    const totalProj = projects.length;
    const completedProj = projects.filter((p: any) => p.status === 'done' || p.status === 'deployed').length;
    const totalTsk = tasks.length;
    const completedTsk = tasks.filter((t: any) => t.status === 'done').length;
    const activeDrifts = Math.round(projects.reduce((sum, p) => sum + (p.delay_drift_days || 0), 0));
    
    // Average dependency trust score
    const avgTrust = memory.dependencyReliabilities.length > 0 
      ? Math.round(memory.dependencyReliabilities.reduce((sum, d) => sum + d.trustScore, 0) / memory.dependencyReliabilities.length)
      : 100;

    return {
      totalProj,
      completedProj,
      totalTsk,
      completedTsk,
      activeDrifts,
      avgTrust
    };
  }, [projects, tasks, memory.dependencyReliabilities]);

  // SVG Chart path calculation for historical trust evolution
  const svgChart = useMemo(() => {
    const w = 600;
    const h = 120;
    const points = intel.riskTrends;
    if (points.length === 0) return { line: '', pts: [] };

    const pts = points.map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      // Convert risk index to a stability index (100 - risk)
      const stability = 100 - p.riskScore;
      const y = h - (stability / 100) * (h * 0.8) - 10;
      return { x, y, val: stability, date: p.date };
    });

    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const cx1 = p0.x + (p1.x - p0.x) / 3;
      const cy1 = p0.y;
      const cx2 = p1.x - (p1.x - p0.x) / 3;
      const cy2 = p1.y;
      d += ` C${cx1},${cy1} ${cx2},${cy2} ${p1.x},${p1.y}`;
    }

    return { line: d, pts };
  }, [intel.riskTrends]);

  return (
    <div className="space-y-8 pb-16 font-geist text-[var(--pm-primary)]" style={{ color: 'var(--pm-on-surface)' }}>
      {/* Header */}
      <div className="flex items-end justify-between px-1 pt-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--pm-on-surface)' }}>
            <div className="flex items-center gap-2">
              <Brain className="w-6 h-6 text-accent-primary" />
              Organizational Memory & Learning Engine
            </div>
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--pm-on-surface-variant)' }}>
            Institutional operational memory, blocker recurrence records, and mitigation effectiveness scores.
          </p>
        </div>
        <div className="flex items-center gap-3 px-4 py-1.5 rounded-full border border-border bg-surface-2"
          style={{ background: 'var(--pm-surface-highest)', borderColor: 'rgba(70,69,84,0.3)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 operational-pulse" style={{ boxShadow: '0 0 8px rgba(192,132,252,0.5)' }} />
          <span className="font-mono-pm text-xs uppercase tracking-widest text-[var(--pm-on-surface-variant)]" style={{ color: 'var(--pm-on-surface-variant)' }}>
             MEMORY SYNCED
          </span>
        </div>
      </div>

      {/* Global Learning Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="pm-card p-5 relative overflow-hidden group">
          <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest block mb-2">Execution Trust Rating</span>
          <p className="text-3xl font-extrabold text-text-primary">
            {globalMetrics.avgTrust}% <span className="text-xs font-medium text-text-tertiary">Avg across systems</span>
          </p>
        </div>
        <div className="pm-card p-5 relative overflow-hidden group">
          <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest block mb-2">Operational Memory Log</span>
          <p className="text-3xl font-extrabold text-text-primary">
            {memory.mitigationOutcomes.length} <span className="text-xs font-medium text-text-tertiary">events registered</span>
          </p>
        </div>
        <div className="pm-card p-5 relative overflow-hidden group">
          <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest block mb-2">Friction Hotspots</span>
          <p className="text-3xl font-extrabold text-signal-warning">{memory.executionPatterns.length} Patterns</p>
        </div>
        <div className="pm-card p-5 relative overflow-hidden group">
          <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest block mb-2">Recurrent Timeline Drift</span>
          <p className={`text-3xl font-extrabold ${globalMetrics.activeDrifts > 5 ? 'text-signal-critical' : 'text-text-primary'}`}>
            +{globalMetrics.activeDrifts} Days
          </p>
        </div>
      </div>

      {/* Strategic Trend Console & Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Stability Trend Chart */}
        <div className="lg:col-span-7 glass-panel rounded-xl p-6 bg-surface-2 border border-border flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-accent-primary" /> Delivery Stability Index
            </h3>
            <p className="text-[10px] text-text-tertiary">Institutional execution stability trend derived from historical blocker recovery latencies.</p>
          </div>
          <div className="h-32 w-full mt-4 relative">
            <svg className="w-full h-full" viewBox="0 0 600 120" preserveAspectRatio="none">
              <path d={svgChart.line} fill="none" stroke="var(--pm-primary)" strokeWidth="2.5" />
              {svgChart.pts.map((pt, i) => (
                <g key={i}>
                  <circle cx={pt.x} cy={pt.y} r="3" fill="var(--pm-primary)" stroke="var(--pm-surface)" strokeWidth="1" />
                  <text x={pt.x} y={pt.y - 8} textAnchor="middle" className="text-[8px] font-mono fill-text-secondary font-bold">
                    {pt.val}%
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <div className="flex justify-between text-[8px] font-mono text-text-tertiary uppercase tracking-widest pt-2 border-t border-border-subtle/50">
            {svgChart.pts.map((pt, i) => (
              <span key={i}>{pt.date}</span>
            ))}
          </div>
        </div>

        {/* Strategic Delivery Profile Checklist for PMs/Stakeholders */}
        <div className="lg:col-span-5 glass-panel rounded-xl p-6 bg-surface-2 border border-border flex flex-col gap-5">
          <div>
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-accent-secondary" /> Project Delivery Behavior Profiles
            </h3>
            <p className="text-[10px] text-text-tertiary">Historical completion behaviors and structural risk ratings.</p>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-48 pr-1 scrollbar-thin">
            {memory.deliveryProfiles.map(dp => {
              const ratingStyles = {
                critical: 'text-signal-critical bg-signal-critical-bg border-signal-critical/20',
                high: 'text-signal-warning bg-signal-warning-bg border-signal-warning/20',
                medium: 'text-accent-secondary bg-surface-3 border-border',
                low: 'text-signal-safe bg-signal-safe/5 border-signal-safe/20'
              };
              const currentStyle = ratingStyles[dp.riskRating] || ratingStyles.low;

              return (
                <div key={dp.projectId} className="p-3 bg-surface rounded-lg border border-border-subtle flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text-primary">{dp.projectName}</span>
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${currentStyle}`}>
                      {dp.riskRating} risk
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px] text-text-secondary mt-1">
                    <div>
                      <span className="text-text-quaternary block uppercase text-[8px]">Completion</span>
                      <span className="font-bold text-text-primary font-mono">{dp.sprintCompletionRatio}%</span>
                    </div>
                    <div>
                      <span className="text-text-quaternary block uppercase text-[8px]">Drift</span>
                      <span className="font-bold text-text-primary font-mono">+{dp.historicalDriftDays}d</span>
                    </div>
                    <div>
                      <span className="text-text-quaternary block uppercase text-[8px]">Blockers/Sprint</span>
                      <span className="font-bold text-text-primary font-mono">{dp.blockerFrequencyPerSprint}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Console Explorer */}
      <div className="glass-panel rounded-xl p-6 bg-surface-2 border border-border">
        <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
          <div className="flex items-center bg-surface-2 rounded-lg p-1 border border-border">
            {[
              { id: 'insights', label: 'Learning Insights' },
              { id: 'mitigations', label: 'Mitigation Outcomes' },
              { id: 'dependencies', label: 'Dependency Trust' },
              { id: 'teams', label: 'Team Performance' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1 text-[9px] font-bold rounded uppercase tracking-wider transition-all ${
                  activeTab === tab.id 
                    ? 'bg-surface text-text-primary shadow-sm border border-border-subtle' 
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="text-[8px] text-text-quaternary uppercase tracking-widest font-bold">Operational Memory Explorer</span>
        </div>

        {/* Tab Content: Learning Insights */}
        {activeTab === 'insights' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {visibleInsights.map(insight => {
              const borderStyles = {
                high: 'border-l-signal-critical bg-signal-critical-bg/30 border-signal-critical/20 text-signal-critical',
                medium: 'border-l-signal-warning bg-signal-warning-bg/30 border-signal-warning/20 text-signal-warning',
                low: 'border-l-border bg-surface-3 text-text-secondary'
              };
              const currentBorder = borderStyles[insight.severity] || borderStyles.low;

              return (
                <div key={insight.id} className={`border rounded-2xl p-5 bg-surface-2/50 backdrop-blur-sm flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow ${currentBorder}`}>
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold text-text-primary">{insight.title}</span>
                      <span className="text-[8px] font-mono text-text-tertiary uppercase">-{insight.impactPercentage}% Efficiency</span>
                    </div>
                    <p className="text-[10px] text-text-secondary leading-snug">{insight.description}</p>
                    <p className="text-[9px] text-text-tertiary mt-2 bg-surface p-1.5 rounded border border-border-subtle leading-normal">
                      <span className="font-bold text-text-secondary uppercase">Evidence:</span> {insight.historicalEvidence}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border-subtle/50 text-[10px]">
                    <span className="text-[8px] text-text-quaternary uppercase font-bold tracking-wider block mb-1">Preemptive Recommendation</span>
                    <p className="text-text-primary italic leading-normal">"{insight.recommendation}"</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab Content: Mitigation Outcomes */}
        {activeTab === 'mitigations' && (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
            {memory.mitigationOutcomes.length === 0 ? (
              <div className="text-center py-6 text-text-quaternary text-xs font-mono uppercase">
                No mitigation outcomes logged.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {memory.mitigationOutcomes.map(mo => {
                  const statusColors = {
                    success: 'text-signal-safe border-signal-safe/20 bg-signal-safe/5',
                    failure: 'text-signal-critical border-signal-critical/20 bg-signal-critical/5',
                    in_progress: 'text-signal-warning border-signal-warning/20 bg-signal-warning/5'
                  };
                  const currentStatus = statusColors[mo.status] || statusColors.in_progress;

                  return (
                    <div key={mo.id} className="p-4 bg-surface-2 border border-border-subtle rounded-xl flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[9px] font-bold text-text-primary">{mo.mitigationTitle}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${currentStatus}`}>
                            {mo.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-[10px] text-text-secondary">{mo.notes}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-bold text-text-primary font-mono">{mo.actualRecoveryTimeHours}h</span>
                        <span className="text-[8px] text-text-quaternary block uppercase">Recovery Time</span>
                        <span className="text-[8px] text-text-tertiary block font-mono">Target: {mo.expectedRecoveryTimeHours}h</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab Content: Dependency Trust */}
        {activeTab === 'dependencies' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {memory.dependencyReliabilities.map(dep => {
              const trendStyles = {
                improving: 'text-signal-safe',
                stable: 'text-text-secondary',
                degrading: 'text-signal-critical'
              };
              const currentTrend = trendStyles[dep.trend] || trendStyles.stable;

              return (
                <div key={dep.dependencyType} className="bg-surface-2 border border-border/50 p-5 rounded-2xl flex flex-col justify-between shadow-sm hover:shadow-md transition-all">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-bold text-text-primary uppercase tracking-wider">{dep.dependencyType} channels</span>
                    <span className={`text-[10px] font-bold uppercase ${currentTrend}`}>
                      {dep.trend}
                    </span>
                  </div>
                  <div className="mt-4 flex justify-between items-baseline">
                    <div>
                      <span className="text-2xl font-bold text-text-primary font-mono">{dep.trustScore}%</span>
                      <span className="text-[8px] text-text-quaternary uppercase block">Trust Index</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-text-secondary font-mono">{dep.averageResolutionHours}h</span>
                      <span className="text-[8px] text-text-quaternary block uppercase">Avg recovery latency</span>
                    </div>
                  </div>
                  <p className="text-[9px] text-text-quaternary mt-2 border-t border-border-subtle/50 pt-2">
                    {dep.totalInstabilityEvents} historical blocker events registered in execution memory.
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab Content: Team Performance */}
        {activeTab === 'teams' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {visibleTeamProfiles.map(team => (
              <div key={team.teamId} className="bg-surface-2 border border-border/50 p-5 rounded-2xl flex flex-col justify-between shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between border-b border-border-subtle/50 pb-2 mb-3">
                  <h4 className="text-xs font-bold text-text-primary uppercase">{team.teamName}</h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                    team.recoveryEfficiencyScore >= 80 ? 'text-signal-safe border-signal-safe/20 bg-signal-safe/5' : 'text-signal-warning border-signal-warning/20 bg-signal-warning/5'
                  }`}>
                    {team.recoveryEfficiencyScore}% Efficiency
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-text-secondary">Average Recovery Latency</span>
                    <span className="font-bold text-text-primary font-mono">{team.averageRecoveryTimeHours}h</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-text-secondary">Mitigation Adaptation Rate</span>
                    <span className="font-bold text-text-primary font-mono">{team.mitigationAdoptionRate}%</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-text-tertiary">
                    <span>Blockers Resolved</span>
                    <span className="font-bold">{team.historicalBlockersResolvedCount} events</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Developer specific: Local Recurrent Blocker Warning */}
      {isDeveloper && (
        <div className="glass-panel rounded-xl p-6 bg-surface-2 border border-border">
          <div className="flex items-center gap-2 mb-4 border-b border-border pb-3">
            <AlertTriangle className="w-4 h-4 text-signal-critical" />
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Developer Local Recovery Dashboard</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-surface border border-border-subtle rounded-xl">
              <span className="text-[9px] font-bold text-text-quaternary uppercase tracking-widest block mb-1">My Blocker Context</span>
              <p className="text-xs text-text-secondary leading-snug">
                You are currently rostered to resolve dependencies in teams with an average recovery efficiency rating of{' '}
                <span className="font-bold text-text-primary">
                  {visibleTeamProfiles.length > 0 ? visibleTeamProfiles[0].recoveryEfficiencyScore : 80}%
                </span>
                . Check active checklists under Admin Panel to minimize local release delay spikes.
              </p>
            </div>
            <div className="p-4 bg-surface border border-border-subtle rounded-xl flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-text-quaternary uppercase tracking-widest block mb-1">Recurring Local Blocker Patterns</span>
                <p className="text-[10px] text-text-tertiary">
                  Watch for Staging deployment instability when validating pull requests on Friday windows.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
