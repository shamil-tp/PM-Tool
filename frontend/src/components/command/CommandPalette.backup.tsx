import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, FolderOpen, LayoutDashboard, Activity, GitBranch, GitFork, Users, Target, BarChart3, Clock, Shield, ShieldAlert, FileText, ChartArea, Settings as SettingsIcon, PlusCircle, UserPlus, BookOpen, CalendarPlus, RefreshCw, TrendingUp, Cpu, BrainCircuit, Zap, Check, Loader, Link2 } from 'lucide-react';
import { Profile, Project, Task, UserRole } from '../../types';
import { canAccessRoute, hasCapability, type Capability } from '../../core/auth/permissions';
import { isRouteDisclosed, type DisclosureLevel } from '../../core/dashboard/progressiveDisclosure';
import { activityLogService } from '../../services/activityLogService';
import { recordUsage, getSessionId } from '../../services/commandUsageService';
import { CANONICAL_ROUTES, renderRouteIcon } from '../../app/routeRegistry';

interface CmdResult {
  id: string;
  group: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  metadata?: Record<string, string>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  profile: Profile | null;
  projects: Project[];
  tasks: Task[];
  setSelectedProject?: (p: Project | null) => void;
  notify: (msg: string, t: 'success' | 'error' | 'info' | 'warning') => void;
  setIsAdding?: (v: boolean) => void;
  workspaceId?: string;
  onOpenAnalytics?: () => void;
  disclosureLevel?: DisclosureLevel;
  disclosureActive?: boolean;
}

const STORAGE_KEY = 'resolve-command-recent';
const USAGE_KEY = 'resolve-command-usage-v2';
const TIMELINE_KEY = 'resolve-command-timeline-v2';
const MAX_RECENT = 10;
const MAX_TIMELINE = 2000;

// --- Alias Engine ---
const ALIASES: Record<string, string> = {
  new: 'create', proj: 'project', gt: 'gantt', spr: 'sprint',
};

function expandAliases(query: string): string {
  return query.split(' ').map(w => ALIASES[w] || w).join(' ');
}

// --- Slash Filters ---
const SLASH_FILTERS: Record<string, string> = {
  '/nav': 'NAVIGATION', '/task': 'TASKS', '/project': 'PROJECTS', '/ai': 'AI', '/action': 'ACTIONS',
};

function parseSlashFilter(query: string): { groupFilter: string | null; cleanQuery: string } {
  const first = query.split(' ')[0].toLowerCase();
  if (first in SLASH_FILTERS) {
    return { groupFilter: SLASH_FILTERS[first], cleanQuery: query.slice(first.length).trim() };
  }
  return { groupFilter: null, cleanQuery: query };
}

// --- AI Command Execution (NLP) ---
const AI_COMMANDS: { match: RegExp; label: string; group: string; icon: React.ReactNode; action: (props: Props) => void }[] = [
  { match: /show.*timeline.*risk/i, label: 'Timeline Risks', group: 'AI', icon: <TrendingUp className="w-3.5 h-3.5" />, action: (p) => p.onNavigate('/execution/timeline') },
  { match: /overload.*(engineer|team|capacity)/i, label: 'Overloaded Engineers', group: 'AI', icon: <Cpu className="w-3.5 h-3.5" />, action: (p) => p.onNavigate('/resources/capacity') },
  { match: /forecast.*sprint/i, label: 'Forecast Sprint', group: 'AI', icon: <GitFork className="w-3.5 h-3.5" />, action: (p) => p.onNavigate('/execution/sprints') },
  { match: /explain.*delay/i, label: 'Explain Delays', group: 'AI', icon: <Activity className="w-3.5 h-3.5" />, action: (p) => p.onNavigate('/execution/timeline') },
  { match: /capacity.*forecast/i, label: 'Capacity Forecast', group: 'AI', icon: <BarChart3 className="w-3.5 h-3.5" />, action: (p) => p.onNavigate('/resources/capacity') },
  { match: /decision.*center/i, label: 'Decision Center', group: 'AI', icon: <Zap className="w-3.5 h-3.5" />, action: (p) => p.onNavigate('/workspace/decisions') },
];

// --- Usage Analytics ---
function incrementUsage(id: string) {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    const usage: Record<string, number> = raw ? JSON.parse(raw) : {};
    usage[id] = (usage[id] || 0) + 1;
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch { /* ignore */ }
}

function getTopUsageIds(limit = 5): string[] {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return [];
    const usage: Record<string, number> = JSON.parse(raw);
    return Object.entries(usage).sort(([, a], [, b]) => b - a).slice(0, limit).map(([id]) => id);
  } catch { return []; }
}

function getUsageCounts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
  } catch { return {}; }
}

// --- Timeline for trends ---
interface TimelineEntry {
  id: string;
  ts: number;
  group: string;
  label: string;
}
function addTimelineEntry(entry: TimelineEntry) {
  try {
    const raw = localStorage.getItem(TIMELINE_KEY);
    const timeline: TimelineEntry[] = raw ? JSON.parse(raw) : [];
    timeline.push(entry);
    if (timeline.length > MAX_TIMELINE) timeline.splice(0, timeline.length - MAX_TIMELINE);
    localStorage.setItem(TIMELINE_KEY, JSON.stringify(timeline));
  } catch { /* ignore */ }
}
function getTimeline(): TimelineEntry[] {
  try {
    return JSON.parse(localStorage.getItem(TIMELINE_KEY) || '[]');
  } catch { return []; }
}

interface CommandTrend { id: string; label: string; group: string; count: number; trend: number; }

// Returns top N commands with 7d count and % change vs 7d prior
function getTopCommandsWithTrend(limit = 5): CommandTrend[] {
  const timeline = getTimeline();
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const recent = timeline.filter(e => now - e.ts < week);
  const prior = timeline.filter(e => now - e.ts >= week && now - e.ts < 2 * week);
  const recentCounts: Record<string, { count: number; label: string; group: string }> = {};
  const priorCounts: Record<string, number> = {};
  recent.forEach(e => {
    if (!recentCounts[e.id]) recentCounts[e.id] = { count: 0, label: e.label, group: e.group };
    recentCounts[e.id].count++;
  });
  prior.forEach(e => { priorCounts[e.id] = (priorCounts[e.id] || 0) + 1; });
  return Object.entries(recentCounts)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, limit)
    .map(([id, info]) => ({
      id, label: info.label, group: info.group, count: info.count,
      trend: priorCounts[id] ? Math.round(((info.count - priorCounts[id]) / priorCounts[id]) * 100) : 0,
    }));
}

// Sequence-based suggestions: looks at last-used command and suggests most common next
function getSequenceSuggestions(): { id: string; label: string; group: string }[] {
  const timeline = getTimeline();
  if (timeline.length < 2) return [];
  const lastId = timeline[timeline.length - 1]?.id;
  if (!lastId) return [];
  const transitions: Record<string, Record<string, number>> = {};
  for (let i = 0; i < timeline.length - 1; i++) {
    const from = timeline[i].id;
    const to = timeline[i + 1].id;
    if (!transitions[from]) transitions[from] = {};
    transitions[from][to] = (transitions[from][to] || 0) + 1;
  }
  const nextCandidates = transitions[lastId];
  if (!nextCandidates) return [];
  return Object.entries(nextCandidates)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([id]) => {
      const entry = timeline.find(e => e.id === id);
      return { id, label: entry?.label || id, group: entry?.group || 'SUGGESTED' };
    });
}

export { getTimeline, getTopCommandsWithTrend, getSequenceSuggestions, type TimelineEntry, type CommandTrend };

const NAV_ITEMS: { label: string; path: string; icon: React.ReactNode }[] = CANONICAL_ROUTES
  .filter(r => 
    !r.isPublic && 
    r.id !== 'onboarding' && 
    r.id !== 'project-new' && 
    r.id !== 'control-root' && 
    !r.id.startsWith('settings-')
  )
  .map(r => ({
    label: r.label,
    path: r.path,
    icon: renderRouteIcon(r.iconName, "w-3.5 h-3.5")
  }));

const ACTION_ITEMS: { label: string; icon: React.ReactNode; capability: Capability; onSelect: (props: Props) => void }[] = [
  { label: 'Create Project', icon: <PlusCircle className="w-3.5 h-3.5" />, capability: 'manage_projects', onSelect: (p) => p.setIsAdding?.(true) },
  { label: 'Create Sprint', icon: <GitFork className="w-3.5 h-3.5" />, capability: 'manage_scheduling', onSelect: (p) => p.onNavigate('/execution/sprints') },
  { label: 'Invite Member', icon: <UserPlus className="w-3.5 h-3.5" />, capability: 'platform_governance', onSelect: (p) => p.onNavigate('/control') },
  { label: 'Create Epic', icon: <BookOpen className="w-3.5 h-3.5" />, capability: 'manage_tasks', onSelect: (p) => p.onNavigate('/execution') },
  { label: 'Create Story', icon: <BookOpen className="w-3.5 h-3.5" />, capability: 'manage_tasks', onSelect: (p) => p.onNavigate('/execution') },
  { label: 'Create Work Item', icon: <PlusCircle className="w-3.5 h-3.5" />, capability: 'manage_tasks', onSelect: (p) => p.onNavigate('/execution') },
  { label: 'Add Company Holiday', icon: <CalendarPlus className="w-3.5 h-3.5" />, capability: 'manage_settings', onSelect: (p) => p.onNavigate('/control/settings') },
  { label: 'Start Retrospective', icon: <RefreshCw className="w-3.5 h-3.5" />, capability: 'manage_scheduling', onSelect: (p) => p.onNavigate('/execution/sprints') },
  { label: 'Create Automation', icon: <Zap className="w-3.5 h-3.5" />, capability: 'manage_automations', onSelect: (p) => p.onNavigate('/control/automations') },
  { label: 'Create Approval', icon: <Check className="w-3.5 h-3.5" />, capability: 'manage_automations', onSelect: (p) => p.onNavigate('/control/automations') },
  { label: 'Generate API Key', icon: <Shield className="w-3.5 h-3.5" />, capability: 'platform_security', onSelect: (p) => p.onNavigate('/control/settings') },
  { label: 'View Execution History', icon: <Activity className="w-3.5 h-3.5" />, capability: 'manage_automations', onSelect: (p) => p.onNavigate('/control/automations') },
];

const AI_ITEMS: { label: string; icon: React.ReactNode; onSelect: (props: Props) => void }[] = [
  { label: 'Timeline Risks', icon: <TrendingUp className="w-3.5 h-3.5" />, onSelect: (p) => p.onNavigate('/execution/timeline') },
  { label: 'Capacity Forecast', icon: <Cpu className="w-3.5 h-3.5" />, onSelect: (p) => p.onNavigate('/resources/capacity') },
  { label: 'Prediction Insights', icon: <BrainCircuit className="w-3.5 h-3.5" />, onSelect: (p) => p.onNavigate('/workspace') },
  { label: 'Decision Center', icon: <Zap className="w-3.5 h-3.5" />, onSelect: (p) => p.onNavigate('/workspace/decisions') },
  { label: 'Command Analytics', icon: <TrendingUp className="w-3.5 h-3.5" />, onSelect: (p) => p.onOpenAnalytics?.() },
];

function scoreMatch(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 85 + (q.length / t.length) * 15;
  const words = q.split(/\s+/);
  const tWords = t.split(/\s+/);
  const wordScore = tWords.filter(w => words.includes(w)).length / Math.max(words.length, 1);
  if (wordScore > 0) return 50 + wordScore * 30;
  if (t.includes(q)) return 60;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  if (qi === q.length) {
    const gap = t.length - q.length;
    return Math.max(30, 50 - gap * 2);
  }
  const acro = tWords.map(w => w[0]).join('');
  if (acro === q) return 45;
  return 0;
}

function filterItems(items: any[], query: string): any[] {
  if (!query.trim()) return items;
  return items.map(item => ({ item, score: scoreMatch(query, item.label || item.name || '') }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.item);
}

function getRecent(): CmdResult[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function addRecent(result: CmdResult) {
  const recent = getRecent().filter(r => r.id !== result.id);
  recent.unshift(result);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

function commandIcon(group: string): React.ReactNode {
  const map: Record<string, React.ReactNode> = {
    NAVIGATION: <FolderOpen className="w-3 h-3 text-signal-info" />,
    PROJECTS: <BarChart3 className="w-3 h-3 text-emerald-400" />,
    TASKS: <Check className="w-3 h-3 text-signal-warning" />,
    ACTIONS: <Zap className="w-3 h-3 text-accent-secondary" />,
    AI: <BrainCircuit className="w-3 h-3 text-cyan-400" />,
    RECENT: <Clock className="w-3 h-3 text-text-quaternary" />,
    SUGGESTED: <TrendingUp className="w-3 h-3 text-text-quaternary" />,
    MOST_USED: <Cpu className="w-3 h-3 text-orange-400" />,
  };
  return map[group] || null;
}

function navDisclosed(
  path: string,
  role: UserRole | undefined,
  disclosureActive: boolean,
  disclosureLevel: DisclosureLevel,
): boolean {
  if (!canAccessRoute(role, path)) return false;
  if (!disclosureActive) return true;
  return isRouteDisclosed(path, disclosureLevel, role);
}

export default function CommandPalette(props: Props) {
  const {
    isOpen,
    onClose,
    onNavigate,
    profile,
    projects,
    tasks,
    setSelectedProject,
    notify,
    setIsAdding,
    workspaceId,
    onOpenAnalytics,
    disclosureLevel = 3,
    disclosureActive = false,
  } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const role = profile?.role || 'viewer';

  const debounceRef = useRef<number | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const id = debounceRef.current;
    if (id !== null) window.clearTimeout(id);
    debounceRef.current = window.setTimeout(() => setDebouncedQuery(query), 150);
    return () => {
      const id2 = debounceRef.current;
      if (id2 !== null) window.clearTimeout(id2);
    };
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setDebouncedQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const allResults = useMemo((): CmdResult[] => {
    const rawQuery = debouncedQuery.trim();

    // --- Step 1: expand aliases ---
    const aliased = expandAliases(rawQuery);

    // --- Step 2: parse slash filter ---
    const { groupFilter, cleanQuery } = parseSlashFilter(aliased);
    const q = cleanQuery;
    const hasFilter = groupFilter !== null;

    // --- Step 3: match AI NLP commands ---
    const matchedAiNlp: CmdResult[] = [];
    if (q) {
      AI_COMMANDS.forEach(cmd => {
        if (cmd.match.test(rawQuery) && !hasFilter) {
          matchedAiNlp.push({
            id: `ainlp:${cmd.label}`, group: 'AI', label: cmd.label, icon: cmd.icon,
            onSelect: () => { addRecent({ id: `ainlp:${cmd.label}`, group: 'AI', label: cmd.label, icon: cmd.icon, onSelect: () => {} }); logCmd('ai_nlp', cmd.label); cmd.action(props); onClose(); },
          });
        }
      });
    }

    const out: CmdResult[] = [];

    // --- AI NLP (always first when matched) ---
    if (matchedAiNlp.length > 0) {
      out.push({ id: '_ainlp_header', group: 'AI', label: 'AI', onSelect: () => {} });
      matchedAiNlp.forEach(r => out.push(r));
    }

    // --- CONTEXTUAL — route-aware suggestions (empty query only) ---
    if (!q && !hasFilter) {
      const route = typeof window !== 'undefined' ? window.location.pathname : '';
      const contextual: { label: string; icon: React.ReactNode; action: () => void }[] = [];
      if (route.startsWith('/execution')) {
        if (navDisclosed('/execution/sprints', role, disclosureActive, disclosureLevel)) {
          contextual.push(
            { label: 'Create Sprint', icon: <GitFork className="w-3.5 h-3.5 text-accent-secondary" />, action: () => { onNavigate('/execution/sprints'); onClose(); } },
          );
        }
        if (navDisclosed('/execution/timeline', role, disclosureActive, disclosureLevel)) {
          contextual.push(
            { label: 'View Timeline', icon: <Activity className="w-3.5 h-3.5 text-accent-secondary" />, action: () => { onNavigate('/execution/timeline'); onClose(); } },
          );
        }
      } else if (route.startsWith('/workspace')) {
        contextual.push(
          { label: 'Create Project', icon: <PlusCircle className="w-3.5 h-3.5 text-accent-secondary" />, action: () => { setIsAdding?.(true); onClose(); } },
        );
        if (navDisclosed('/workspace/decisions', role, disclosureActive, disclosureLevel)) {
          contextual.push(
            { label: 'Decision Center', icon: <BrainCircuit className="w-3.5 h-3.5 text-accent-secondary" />, action: () => { onNavigate('/workspace/decisions'); onClose(); } },
          );
        }
      } else if (route.startsWith('/resources')) {
        if (navDisclosed('/resources/capacity', role, disclosureActive, disclosureLevel)) {
          contextual.push(
            { label: 'View Capacity', icon: <BarChart3 className="w-3.5 h-3.5 text-accent-secondary" />, action: () => { onNavigate('/resources/capacity'); onClose(); } },
          );
        }
      }
      if (contextual.length > 0) {
        out.push({ id: '_contextual_header', group: 'MOST_USED', label: `ROUTE: ${route.split('/').filter(Boolean).pop()?.toUpperCase() || 'HOME'}`, onSelect: () => {} });
        contextual.forEach(c => out.push({
          id: `ctx:${c.label}`, group: 'MOST_USED', label: c.label, icon: c.icon,
          onSelect: () => { addRecent({ id: `ctx:${c.label}`, group: 'MOST_USED', label: c.label, icon: c.icon, onSelect: () => {} }); logCmd('contextual', c.label); c.action(); },
        }));
        out.push({ id: '_contextual_spacer', group: 'DIVIDER', label: '', onSelect: () => {} });
      }
    }

    // --- MOST_USED — top commands with trend (empty query only) ---
    if (!q && !hasFilter) {
      const topTrend = getTopCommandsWithTrend(5);
      if (topTrend.length > 0) {
        out.push({ id: '_mostused_header', group: 'MOST_USED', label: 'MOST USED', onSelect: () => {} });
        topTrend.forEach(t => out.push({
          id: `trend:${t.id}`, group: 'MOST_USED',
          label: `${t.label}`,
          description: `${t.count}x this week · ${t.trend >= 0 ? '↑' : '↓'} ${Math.abs(t.trend)}%`,
          icon: <Cpu className="w-3.5 h-3.5 text-orange-400" />,
          onSelect: () => {
            const [type, label] = t.id.split(':');
            logCmd('most_used', t.label);
            if (type === 'navigation') {
              const nav = NAV_ITEMS.find(n => n.label === label);
              if (nav) onNavigate(nav.path);
              onClose();
            } else if (type === 'project_open') {
              const p = projects.find(proj => proj.name === label);
              if (p) {
                setSelectedProject?.(p);
                onNavigate(`/projects/${p.id}/board`);
              }
              onClose();
            } else if (type === 'task_open') {
              const task = tasks.find(tsk => tsk.name === label);
              if (task) onNavigate(`/execution?task=${task.id}`);
              onClose();
            } else if (type === 'action') {
              const action = ACTION_ITEMS.find(a => a.label === label);
              if (action) action.onSelect(props);
              onClose();
            } else if (type === 'ai') {
              const ai = AI_ITEMS.find(a => a.label === label);
              if (ai) ai.onSelect(props);
              onClose();
            } else {
              onClose();
            }
          },
        }));
      }
    }

    // --- SUGGESTED — preload likely next when query empty and no filter ---
    if (!q && !hasFilter) {
      const recent = getRecent();
      const topIds = getTopUsageIds(5);

      // Reconstruct results from top-used IDs
      const suggested: CmdResult[] = [];
      const seen = new Set<string>();

      // first try top usage that isn't already recent
      topIds.forEach(id => {
        if (seen.has(id)) return;
        const r = recent.find(r => r.id === id);
        if (!r) return;
        if (recent.indexOf(r) < 3) return; // skip if already in recent top 3
        seen.add(id);

        const boundOnSelect = () => {
          const [prefix, val] = r.id.split(':');
          if (prefix === 'nav') {
            onNavigate(val);
            onClose();
          } else if (prefix === 'proj') {
            const p = projects.find(proj => proj.id === val);
            if (p) {
              setSelectedProject?.(p);
              onNavigate(`/projects/${p.id}/board`);
            }
            onClose();
          } else if (prefix === 'task') {
            onNavigate(`/execution?task=${val}`);
            onClose();
          } else if (prefix === 'action') {
            const action = ACTION_ITEMS.find(a => a.label === val);
            if (action) action.onSelect(props);
            onClose();
          } else if (prefix === 'ai') {
            const ai = AI_ITEMS.find(a => a.label === val);
            if (ai) ai.onSelect(props);
            onClose();
          } else {
            onClose();
          }
        };

        suggested.push({ ...r, group: 'SUGGESTED', onSelect: boundOnSelect });
      });

      // Then add any items frequently used with current context
      if (suggested.length > 0) {
        out.push({ id: '_suggested_header', group: 'SUGGESTED', label: 'SUGGESTED', onSelect: () => {} });
        suggested.forEach(r => out.push(r));
      }

      // Sequence-based: predict next command from workflow patterns
      const sequenceSuggestions = getSequenceSuggestions();
      if (sequenceSuggestions.length > 0) {
        // Only show if not already in suggested
        const suggestedIds = new Set(suggested.map(s => s.id));
        const uniqueSequences = sequenceSuggestions.filter(s => !suggestedIds.has(s.id) && !seen.has(s.id));
        if (uniqueSequences.length > 0) {
          // Add a divider label
          out.push({ id: '_predict_header', group: 'SUGGESTED', label: 'PREDICTED', onSelect: () => {} });
          uniqueSequences.forEach(s => {
            seen.add(s.id);
            out.push({
              id: `predict:${s.id}`, group: 'SUGGESTED', label: s.label,
              description: 'Workflow prediction',
              icon: <Zap className="w-3.5 h-3.5 text-signal-warning" />,
              onSelect: () => {
                logCmd('predict', s.label);
                const [type, label] = s.id.split(':');
                if (type === 'navigation') {
                  const nav = NAV_ITEMS.find(n => n.label === label);
                  if (nav) onNavigate(nav.path);
                  onClose();
                } else if (type === 'project_open') {
                  const p = projects.find(proj => proj.name === label);
                  if (p) {
                    setSelectedProject?.(p);
                    onNavigate(`/projects/${p.id}/board`);
                  }
                  onClose();
                } else if (type === 'task_open') {
                  const task = tasks.find(tsk => tsk.name === label);
                  if (task) onNavigate(`/execution?task=${task.id}`);
                  onClose();
                } else if (type === 'action') {
                  const action = ACTION_ITEMS.find(a => a.label === label);
                  if (action) action.onSelect(props);
                  onClose();
                } else if (type === 'ai') {
                  const ai = AI_ITEMS.find(a => a.label === label);
                  if (ai) ai.onSelect(props);
                  onClose();
                } else {
                  onClose();
                }
              },
            });
          });
        }
      }
    }

    // --- RECENT — only when query empty ---
    if (!q && !hasFilter) {
      const recent = getRecent();
      if (recent.length > 0) {
        out.push({ id: '_recent_header', group: 'RECENT', label: 'RECENT', onSelect: () => {} });
        recent.forEach(r => {
          const boundOnSelect = () => {
            const [prefix, val] = r.id.split(':');
            if (prefix === 'nav') {
              onNavigate(val);
              onClose();
            } else if (prefix === 'proj') {
              const p = projects.find(proj => proj.id === val);
              if (p) {
                setSelectedProject?.(p);
                onNavigate(`/projects/${p.id}/board`);
              }
              onClose();
            } else if (prefix === 'task') {
              onNavigate(`/execution?task=${val}`);
              onClose();
            } else if (prefix === 'action') {
              const action = ACTION_ITEMS.find(a => a.label === val);
              if (action) action.onSelect(props);
              onClose();
            } else if (prefix === 'ai') {
              const ai = AI_ITEMS.find(a => a.label === val);
              if (ai) ai.onSelect(props);
              onClose();
            } else {
              onClose();
            }
          };

          out.push({
            ...r,
            group: 'RECENT',
            onSelect: boundOnSelect
          });
        });
      }
    }

    // --- NAVIGATION ---
    if (!hasFilter || groupFilter === 'NAVIGATION') {
      const visibleNav = NAV_ITEMS.filter(n =>
        navDisclosed(n.path, role, disclosureActive, disclosureLevel),
      );
      const matchedNav = q ? filterItems(visibleNav, q) : (hasFilter ? visibleNav : []);
      if (matchedNav.length > 0) {
        out.push({ id: '_nav_header', group: 'NAVIGATION', label: 'NAVIGATION', onSelect: () => {} });
        matchedNav.forEach(n => out.push({
          id: `nav:${n.path}`, group: 'NAVIGATION', label: n.label, icon: n.icon,
          onSelect: () => { addRecent({ id: `nav:${n.path}`, group: 'NAVIGATION', label: n.label, icon: n.icon, onSelect: () => {} }); logCmd('navigation', n.label); onNavigate(n.path); onClose(); },
        }));
      }
    }

    // --- PROJECTS ---
    if (!hasFilter || groupFilter === 'PROJECTS') {
      const matchedProjects = q ? filterItems(projects, q) : (hasFilter ? projects : []);
      if (matchedProjects.length > 0) {
        out.push({ id: '_proj_header', group: 'PROJECTS', label: 'PROJECTS', onSelect: () => {} });
        matchedProjects.forEach(p => out.push({
          id: `proj:${p.id}`, group: 'PROJECTS', label: p.name,
          description: `${p.execution_mode} · ${p.status}${p.efficiency ? ` · ${p.efficiency}%` : ''}`,
          icon: <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />,
          metadata: { project_id: p.id, status: p.status, execution_mode: p.execution_mode },
          onSelect: () => { addRecent({ id: `proj:${p.id}`, group: 'PROJECTS', label: p.name, icon: <BarChart3 className="w-3.5 h-3.5" />, onSelect: () => {} }); logCmd('project_open', p.name, { project_id: p.id }); setSelectedProject?.(p); onNavigate(`/projects/${p.id}/board`); onClose(); },
        }));
      }
    }

    // --- TASKS ---
    if (!hasFilter || groupFilter === 'TASKS') {
      const matchedTasks = q ? filterItems(tasks, q) : (hasFilter ? tasks : []);
      if (matchedTasks.length > 0) {
        out.push({ id: '_task_header', group: 'TASKS', label: 'TASKS', onSelect: () => {} });
        matchedTasks.forEach(t => out.push({
          id: `task:${t.id}`, group: 'TASKS', label: t.name,
          description: `${t.status} · ${t.priority}`,
          icon: <Check className="w-3.5 h-3.5 text-signal-warning" />,
          metadata: { task_id: t.id, status: t.status, priority: t.priority },
          onSelect: () => { addRecent({ id: `task:${t.id}`, group: 'TASKS', label: t.name, icon: <Check className="w-3.5 h-3.5" />, onSelect: () => {} }); logCmd('task_open', t.name, { task_id: t.id }); onNavigate(`/execution?task=${t.id}`); onClose(); },
        }));
      }
    }

    // --- ACTIONS ---
    if (!hasFilter || groupFilter === 'ACTIONS') {
      const visibleActions = ACTION_ITEMS.filter(a => {
        if (!hasCapability(role, a.capability)) return false;
        if (!disclosureActive) return true;
        if (a.capability === 'platform_governance' || a.capability === 'platform_security') {
          return disclosureLevel >= 3;
        }
        if (a.capability === 'manage_automations') return disclosureLevel >= 3;
        if (a.capability === 'manage_scheduling' && a.label.includes('Sprint')) {
          return disclosureLevel >= 1;
        }
        return true;
      });
      const matchedActions = q ? filterItems(visibleActions, q) : (hasFilter ? visibleActions : []);
      if (matchedActions.length > 0) {
        out.push({ id: '_action_header', group: 'ACTIONS', label: 'ACTIONS', onSelect: () => {} });
        matchedActions.forEach(a => out.push({
          id: `action:${a.label}`, group: 'ACTIONS', label: a.label, icon: a.icon,
          onSelect: () => { addRecent({ id: `action:${a.label}`, group: 'ACTIONS', label: a.label, icon: a.icon, onSelect: () => {} }); logCmd('action', a.label); a.onSelect(props); onClose(); },
        }));
      }
    }

    // --- AI (static items, shown when filtered via /ai) ---
    if (!hasFilter || groupFilter === 'AI') {
      const visibleAi = AI_ITEMS.filter(item => {
        if (!disclosureActive) return true;
        if (item.label === 'Command Analytics' || item.label === 'Decision Center') {
          return disclosureLevel >= 2;
        }
        if (item.label === 'Capacity Forecast') return disclosureLevel >= 2;
        return disclosureLevel >= 1;
      });
      const matchedAI = q ? filterItems(visibleAi, q) : (hasFilter ? visibleAi : []);
      if (matchedAI.length > 0) {
        out.push({ id: '_ai_header', group: 'AI', label: 'AI', onSelect: () => {} });
        matchedAI.forEach(a => out.push({
          id: `ai:${a.label}`, group: 'AI', label: a.label, icon: a.icon,
          onSelect: () => { addRecent({ id: `ai:${a.label}`, group: 'AI', label: a.label, icon: a.icon, onSelect: () => {} }); logCmd('ai', a.label); a.onSelect(props); onClose(); },
        }));
      }
    }

    return out;
  }, [debouncedQuery, projects, tasks, role, disclosureActive, disclosureLevel]);

  const flatResults = useMemo(() => allResults.filter(r => !r.id.startsWith('_')), [allResults]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = flatResults[selectedIndex];
      if (result) result.onSelect();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [flatResults, selectedIndex, onClose]);

  const logCmd = async (type: string, target: string, extra?: Record<string, string>) => {
    const id = `${type}:${target}`;
    const route = window.location.pathname;
    // Record to Supabase + localStorage cache
    recordUsage({
      workspace_id: workspaceId || '',
      user_id: profile?.id,
      command_id: target,
      command_type: type,
      route,
      session_id: getSessionId(),
      metadata: { ...extra },
    });
    // Increment local usage counter
    try {
      const raw = localStorage.getItem(USAGE_KEY);
      const usage: Record<string, number> = raw ? JSON.parse(raw) : {};
      usage[id] = (usage[id] || 0) + 1;
      localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
    } catch { /* ignore */ }
    // Immutable log
    if (!workspaceId) return;
    await activityLogService.appendLog({
      workspace_id: workspaceId,
      actor_id: profile?.id,
      action: 'command_used',
      metadata: { command_type: type, target, route, ...extra }
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-[200] bg-bg"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed inset-0 z-[201] flex items-start justify-center pt-[15vh] px-4 pointer-events-none"
          >
            <div
              className="w-full max-w-xl bg-surface border border-white/15 shadow-2xl pointer-events-auto overflow-hidden"
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-label="Command palette"
              aria-modal="true"
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border" role="combobox" aria-expanded={allResults.length > 0} aria-haspopup="listbox">
                <Search className="w-4 h-4 text-text-quaternary shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search projects, tasks, navigation and actions..."
                  className="flex-1 bg-transparent text-sm font-mono text-text-primary outline-none placeholder:text-text-quaternary"
                  aria-autocomplete="list"
                  aria-controls="command-results"
                  aria-activedescendant={selectedIndex >= 0 ? `cmd-result-${selectedIndex}` : undefined}
                  aria-label="Command search"
                />
                <kbd className="hidden sm:inline-flex text-[9px] font-mono uppercase text-text-quaternary border border-border px-1.5 py-0.5" aria-label="Close with escape key">esc</kbd>
              </div>

              {/* Results */}
              <div ref={listRef} id="command-results" className="max-h-[50vh] overflow-y-auto py-2" onKeyDown={handleKeyDown} role="listbox" aria-label="Search results">
                {allResults.length === 0 && (
                  <div className="px-4 py-8 text-center text-[11px] font-mono text-text-quaternary uppercase">
                    {debouncedQuery ? 'No results found' : 'Type to search...'}
                  </div>
                )}

                {allResults.filter(r => r.group !== 'DIVIDER').map((result, idx) => {
                  const flatIdx = flatResults.indexOf(result);
                  const isHeader = result.id.startsWith('_');
                  const isSelected = flatIdx === selectedIndex && !isHeader;

                  return (
                    <div
                      key={result.id}
                      onClick={() => { if (!isHeader) result.onSelect(); }}
                      onMouseEnter={() => { if (!isHeader && flatIdx >= 0) setSelectedIndex(flatIdx); }}
                      role={isHeader ? 'presentation' : 'option'}
                      aria-selected={isSelected}
                      id={!isHeader ? `cmd-result-${flatIdx}` : undefined}
                      className={`flex items-center gap-3 px-4 py-2 text-xs font-mono cursor-pointer transition-colors ${
                        isHeader
                          ? 'text-[9px] uppercase tracking-wide text-text-quaternary pt-4 pb-1.5 px-4 cursor-default'
                          : isSelected
                            ? 'bg-[var(--pm-surface)]/10 text-text-primary'
                            : 'text-text-secondary hover:bg-[var(--pm-surface)]/5'
                      }`}
                    >
                      {isHeader && (
                        <span className="flex items-center gap-2">
                          {commandIcon(result.group)}
                          {result.label}
                        </span>
                      )}
                      {!isHeader && (
                        <>
                          <span className="shrink-0">{result.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="truncate">{result.label}</div>
                            {result.description && (
                              <div className="text-[10px] text-text-quaternary truncate">{result.description}</div>
                            )}
                          </div>
                          {result.metadata?.status && (
                            <span className={`text-[9px] uppercase px-1.5 py-0.5 border ${
                              result.metadata.status === 'active' ? 'border-emerald-500/30 text-emerald-400' :
                              result.metadata.status === 'deployed' ? 'border-border text-signal-info' :
                              'border-border text-text-quaternary'
                            }`}>
                              {result.metadata.status}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
