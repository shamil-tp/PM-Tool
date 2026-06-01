import React, { useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingUp, TrendingDown, Activity, BarChart3, Zap, BrainCircuit, Cpu, AlertTriangle, Route, Heart, Lightbulb, Shield } from 'lucide-react';
import { activityLogService } from '../../services/activityLogService';
import {
  getTopCommandsWithTrend,
  detectFriction,
  getWorkflowChains,
  getHealthScore,
  getPredictiveSuggestions,
  type CommandTrend,
  type FrictionEvent,
  type WorkflowChain,
  type HealthScore,
  type PredictiveSuggestion,
} from '../../services/commandUsageService';
import { hasCapability } from '../../core/auth/permissions';
import type { UserRole } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  role: string;
  workspaceId?: string;
  profileId?: string;
  currentRoute?: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getScopeLabel(role: string): string {
  const r = role as UserRole;
  if (hasCapability(r, 'platform_governance')) return 'WORKSPACE';
  if (hasCapability(r, 'manage_projects') || hasCapability(r, 'manage_teams')) return 'TEAM';
  return 'PERSONAL';
}

function getScopeDescription(role: string): string {
  const r = role as UserRole;
  if (hasCapability(r, 'platform_governance')) return 'Full workspace intelligence';
  if (hasCapability(r, 'manage_projects') || hasCapability(r, 'manage_teams')) return 'Aggregate team command patterns';
  return 'Your personal command usage only';
}

export default function CommandAnalytics({ isOpen, onClose, role, workspaceId, profileId, currentRoute }: Props) {
  const [trend, setTrend] = React.useState<CommandTrend[]>([]);
  const [friction, setFriction] = React.useState<FrictionEvent[]>([]);
  const [chains, setChains] = React.useState<WorkflowChain[]>([]);
  const [health, setHealth] = React.useState<HealthScore | null>(null);
  const [suggestions, setSuggestions] = React.useState<PredictiveSuggestion[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [logged, setLogged] = React.useState(false);

  const scope = getScopeLabel(role);
  const hasData = workspaceId && (trend.length > 0 || friction.length > 0 || chains.length > 0 || health !== null);

  useEffect(() => {
    if (!isOpen || !workspaceId) return;
    setLoading(true);

    const userId = scope === 'PERSONAL' ? profileId : undefined;

    Promise.all([
      getTopCommandsWithTrend(workspaceId, userId, 5, role),
      detectFriction(workspaceId, userId),
      getWorkflowChains(workspaceId, userId),
      getHealthScore(workspaceId, userId, role),
      getPredictiveSuggestions(workspaceId, userId, role, currentRoute),
    ]).then(([t, f, c, h, s]) => {
      setTrend(t);
      setFriction(f);
      setChains(c);
      setHealth(h);
      setSuggestions(s);
      setLoading(false);

      // Immutable log once per open
      if (!logged) {
        setLogged(true);
        activityLogService.logHeatmapView(workspaceId, profileId, { role, scope, trend_count: t.length, friction_count: f.length });
        if (h) activityLogService.logHealthGenerated(workspaceId, profileId, h);
      }
    });
  }, [isOpen, workspaceId]);

  const scopeColor = scope === 'PERSONAL' ? 'text-signal-info border-border'
    : scope === 'TEAM' ? 'text-emerald-400 border-emerald-500/30'
    : 'text-accent-secondary border-border';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-[300] bg-bg"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed inset-0 z-[301] flex items-start justify-center pt-[6vh] px-4 pointer-events-none"
          >
            <div
              className="w-full max-w-2xl max-h-[82vh] overflow-y-auto bg-surface border border-white/15 shadow-2xl pointer-events-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4 text-orange-400" />
                  <span className="text-xs font-mono text-text-secondary tracking-wide">COMMAND INTELLIGENCE</span>
                  <span className={`text-[9px] font-mono uppercase ${scopeColor} border px-1.5 py-0.5`}>
                    {scope}
                  </span>
                </div>
                <button onClick={onClose} className="text-text-quaternary hover:text-text-secondary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-6">

                {loading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-4 h-4 border border-white/30 border-t-transparent animate-spin" />
                    <span className="ml-3 text-[10px] font-mono text-text-quaternary uppercase">Loading intelligence...</span>
                  </div>
                )}

                {!loading && !hasData && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <span className="text-[11px] font-mono text-text-quaternary uppercase tracking-wider">Not enough workspace data</span>
                    <span className="text-[9px] font-mono text-text-quaternary">Use the command palette (Ctrl+K) to generate intelligence data</span>
                  </div>
                )}

                {!loading && hasData && (
                  <>
                    {/* Data Scope */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-surface-3 border border-border-subtle">
                      <Shield className={`w-3 h-3 ${scope === 'PERSONAL' ? 'text-signal-info' : scope === 'TEAM' ? 'text-emerald-400' : 'text-accent-secondary'}`} />
                      <span className={`text-[9px] font-mono ${scope === 'PERSONAL' ? 'text-signal-info/60' : scope === 'TEAM' ? 'text-emerald-400/60' : 'text-accent-secondary/60'}`}>
                        {getScopeDescription(role)}
                      </span>
                    </div>

                    {/* 1. Command Health Score */}
                    {health && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Heart className="w-3.5 h-3.5 text-signal-critical" />
                          <span className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">Command Health</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: 'Overall', value: health.overall, color: health.overall >= 70 ? 'text-emerald-400' : health.overall >= 40 ? 'text-signal-warning' : 'text-signal-critical' },
                            { label: 'Discoverability', value: health.discoverability, color: health.discoverability >= 60 ? 'text-emerald-400' : health.discoverability >= 30 ? 'text-signal-warning' : 'text-signal-critical' },
                            { label: 'Efficiency', value: health.efficiency, color: health.efficiency >= 60 ? 'text-emerald-400' : health.efficiency >= 30 ? 'text-signal-warning' : 'text-signal-critical' },
                            { label: 'Nav Friction', value: 100 - health.navigation_friction, color: health.navigation_friction <= 30 ? 'text-emerald-400' : health.navigation_friction <= 60 ? 'text-signal-warning' : 'text-signal-critical' },
                          ].map(stat => (
                            <div key={stat.label} className="px-3 py-2 bg-surface-3 border border-border-subtle text-center">
                              <div className={`text-lg font-mono ${stat.color}`}>{stat.value}%</div>
                              <div className="text-[8px] font-mono text-text-quaternary uppercase tracking-wider mt-1">{stat.label}</div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 px-3 py-1.5 bg-signal-warning-bg border border-border">
                          <span className="text-[9px] font-mono text-signal-warning/70">Top Bottleneck: </span>
                          <span className="text-[10px] font-mono text-signal-warning">{health.top_bottleneck}</span>
                        </div>
                      </div>
                    )}

                    {/* 2. Predictive Suggestions V2 */}
                    {suggestions.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Lightbulb className="w-3.5 h-3.5 text-signal-warning" />
                          <span className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">Predictive Suggestions</span>
                          <span className="text-[9px] font-mono text-text-quaternary">weighted: recency · frequency · time · chain · role</span>
                        </div>
                        <div className="space-y-1">
                          {suggestions.map(s => (
                            <div key={s.command_id} className="flex items-center gap-3 px-3 py-2 bg-surface-3 border border-border-subtle">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-mono text-text-secondary truncate">{s.label}</div>
                                <div className="text-[9px] font-mono text-text-quaternary truncate">{s.reason}</div>
                              </div>
                              <div className="text-[9px] font-mono text-text-quaternary">{s.score}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. Most Used with Trend */}
                    {trend.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Cpu className="w-3.5 h-3.5 text-orange-400" />
                          <span className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">Most Used</span>
                        </div>
                        <div className="space-y-1">
                          {trend.map(t => (
                            <div key={t.command_id} className="flex items-center gap-3 px-3 py-2 bg-surface-3 border border-border-subtle">
                              <span className="text-xs font-mono text-text-secondary flex-1 truncate">{t.label}</span>
                              <span className="text-[10px] font-mono text-text-quaternary">{t.count}x</span>
                              <span className={`text-[10px] font-mono ${t.trend >= 0 ? 'text-emerald-400' : 'text-signal-critical'}`}>
                                {t.trend >= 0 ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                                {' '}{Math.abs(t.trend)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 4. Friction Detection Engine */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-3.5 h-3.5 text-signal-warning" />
                        <span className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">Friction Detection</span>
                        {friction.length > 0 && (
                          <span className="text-[9px] font-mono text-signal-warning/60">{friction.length} events</span>
                        )}
                      </div>
                      {friction.length === 0 ? (
                        <div className="px-3 py-3 text-[10px] font-mono text-text-quaternary">
                          {trend.length > 0 ? 'No friction patterns detected this week' : 'Insufficient data for friction analysis'}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {friction.map((f, i) => (
                            <div key={i} className="flex items-start gap-3 px-3 py-2 bg-surface-3 border border-border-subtle">
                              <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                                f.severity === 'high' ? 'bg-red-500' : f.severity === 'medium' ? 'bg-amber-500' : 'bg-yellow-500'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-mono text-text-secondary truncate">{f.description}</div>
                                <div className="text-[8px] font-mono text-text-quaternary uppercase mt-0.5">
                                  {f.type.replace('_', ' ')} · {f.severity} · {f.count}x
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 5. Workflow Path Discovery */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Route className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">Workflow Paths</span>
                        {chains.length > 0 && (
                          <span className="text-[9px] font-mono text-cyan-400/60">Top {chains.length}</span>
                        )}
                      </div>
                      {chains.length === 0 ? (
                        <div className="px-3 py-3 text-[10px] font-mono text-text-quaternary">
                          {trend.length > 0 ? 'Not enough session data for path analysis' : 'Insufficient data for workflow paths'}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {chains.map((chain, i) => (
                            <div key={i} className="px-3 py-2 bg-surface-3 border border-border-subtle">
                              <div className="flex items-center gap-2 text-[10px] font-mono text-text-secondary">
                                {chain.path.map((step, si) => (
                                  <React.Fragment key={si}>
                                    {si > 0 && <span className="text-text-quaternary">→</span>}
                                    <span>{step}</span>
                                  </React.Fragment>
                                ))}
                              </div>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-[8px] font-mono text-text-quaternary">{chain.count} completions</span>
                                <div className="flex-1 max-w-[100px] h-1 bg-[var(--pm-surface)]/5">
                                  <div className="h-full bg-cyan-500/40" style={{ width: `${chain.completion_pct}%` }} />
                                </div>
                                <span className="text-[8px] font-mono text-cyan-400/60">{chain.completion_pct}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 6. Context Insights */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <BrainCircuit className="w-3.5 h-3.5 text-signal-warning" />
                        <span className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">Context Intelligence</span>
                      </div>
                      <div className="space-y-1">
                        {[
                          friction.length > 0 && `Friction detected: ${friction.filter(f => f.severity === 'high').length} high, ${friction.filter(f => f.severity === 'medium').length} medium`,
                          health && `Health score: ${health.overall}% (${health.top_bottleneck === 'None detected' ? 'No blockers' : health.top_bottleneck})`,
                          suggestions.length > 0 && `Top suggestion: ${suggestions[0].label} (score ${suggestions[0].score})`,
                          chains.length > 0 && `Most common path: ${chains[0].path.join(' → ')}`,
                          `Data scope: ${scope}`,
                        ].filter(Boolean).slice(0, 4).map((insight, i) => (
                          <div key={i} className="flex items-start gap-2 px-3 py-2 bg-surface-3 border border-border-subtle">
                            <span className="text-[9px] font-mono text-signal-warning/60 mt-0.5">◆</span>
                            <span className="text-[11px] font-mono text-text-secondary">{insight}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                      <span className="text-[9px] font-mono text-text-quaternary">Data from Supabase · localStorage fallback</span>
                      <span className="text-[9px] font-mono text-text-quaternary">
                        {trend.reduce((s, t) => s + t.count, 0)} commands this week
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
