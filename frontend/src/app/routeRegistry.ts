import React from 'react';
import type { Capability } from '../core/auth/permissions';
import { RouteIcon } from '../components/ui/RouteIcon';

export type SidebarGroup = 'core' | 'intelligence' | 'resources' | 'system';
export type DisclosureTier = 'essential' | 'operational' | 'intelligence' | 'platform';

export interface AppRoute {
  id: string;
  path: string;
  label: string;
  iconName: string;
  capability?: Capability;
  group?: SidebarGroup;
  disclosureTier: DisclosureTier;
  isPublic?: boolean;
}

export interface SidebarNavItem {
  id: string;
  label: string;
  path: string;
  group: SidebarGroup;
  capability?: Capability;
  disclosureTier: DisclosureTier;
  iconName: string;
}

// Canonical routes registry
export const CANONICAL_ROUTES: AppRoute[] = [
  // Core routes
  { id: 'overview', path: '/overview', label: 'Overview', iconName: 'Radar', capability: 'view_projects', group: 'core', disclosureTier: 'essential' },
  { id: 'projects', path: '/workspace', label: 'Projects', iconName: 'TreeStructure', capability: 'view_projects', group: 'core', disclosureTier: 'essential' },
  { id: 'knowledge', path: '/workspace/knowledge', label: 'Knowledge Hub', iconName: 'ArchiveBox', capability: 'view_projects', group: 'core', disclosureTier: 'essential' },
  { id: 'board', path: '/execution', label: 'Tasks', iconName: 'Kanban', capability: 'view_tasks', group: 'core', disclosureTier: 'essential' },
  { id: 'scheduling', path: '/execution/timeline', label: 'Scheduling', iconName: 'Timeline', capability: 'view_scheduling', group: 'core', disclosureTier: 'operational' },
  
  // Intelligence routes
  { id: 'analytics', path: '/control/analytics', label: 'Analytics', iconName: 'ChartLineUp', capability: 'view_analytics', group: 'intelligence', disclosureTier: 'intelligence' },
  { id: 'decisions', path: '/workspace/decisions', label: 'Decision Center', iconName: 'Compass', capability: 'view_decision_center', group: 'intelligence', disclosureTier: 'intelligence' },
  
  // Resources routes
  { id: 'work-logs', path: '/resources/work-logs', label: 'Work Logs', iconName: 'Notebook', capability: 'view_reports', group: 'resources', disclosureTier: 'operational' },
  { id: 'logistics', path: '/resources', label: 'Logistics', iconName: 'PhosphorGitBranch', capability: 'manage_logistics', group: 'resources', disclosureTier: 'operational' },
  { id: 'finance', path: '/resources/finance', label: 'Accounts & Finance', iconName: 'Bank', capability: 'manage_finance', group: 'resources', disclosureTier: 'platform' },
  { id: 'teams', path: '/resources/teams', label: 'Team Roster', iconName: 'UsersThree', capability: 'view_teams', group: 'resources', disclosureTier: 'operational' },
  { id: 'capacity', path: '/resources/capacity', label: 'Capacity Forecast', iconName: 'BarChart3', capability: 'view_reports', group: 'resources', disclosureTier: 'operational' },
  { id: 'portfolio', path: '/workspace/portfolio', label: 'Project Sponsors', iconName: 'Building2', capability: 'view_stakeholders', group: 'resources', disclosureTier: 'intelligence' },
  { id: 'audit', path: '/control/audit', label: 'Audit Log', iconName: 'Activity', capability: 'view_audit_log', group: 'resources', disclosureTier: 'platform' },
  
  // System routes
  { id: 'document-templates', path: '/control/document-templates', label: 'Document Templates', iconName: 'FileText', capability: 'manage_settings', group: 'system', disclosureTier: 'platform' },
  { id: 'identity', path: '/control/identity', label: 'Admin & Identity', iconName: 'Shield', capability: 'platform_governance', group: 'system', disclosureTier: 'platform' },
  { id: 'automations', path: '/control/automations', label: 'Automations', iconName: 'Zap', capability: 'manage_automations', group: 'system', disclosureTier: 'platform' },
  { id: 'mission-control', path: '/control/mission-control', label: 'Mission Control', iconName: 'Broadcast', capability: 'view_mission_control', group: 'intelligence', disclosureTier: 'platform' },
  { id: 'system-health', path: '/control/system-health', label: 'System Health', iconName: 'Activity', capability: 'platform_governance', group: 'system', disclosureTier: 'platform' },
  { id: 'settings', path: '/control/settings', label: 'Settings', iconName: 'Settings', capability: 'manage_settings', group: 'system', disclosureTier: 'operational' },
  { id: 'integrations', path: '/control/connections', label: 'Integrations', iconName: 'Link2', capability: 'manage_integrations', group: 'system', disclosureTier: 'platform' },

  // Executive routes
  { id: 'executive', path: '/workspace/executive', label: 'Executive Overview', iconName: 'Binoculars', capability: 'view_analytics', group: 'intelligence', disclosureTier: 'intelligence' },
  { id: 'reports', path: '/workspace/reports', label: 'Reports Center', iconName: 'Files', capability: 'view_reports', group: 'intelligence', disclosureTier: 'intelligence' },


  // Non-sidebar / helper routes
  { id: 'landing', path: '/', label: 'Home', iconName: 'LayoutDashboard', isPublic: true, disclosureTier: 'essential' },
  { id: 'privacy', path: '/privacy', label: 'Privacy Policy', iconName: 'FileText', isPublic: true, disclosureTier: 'essential' },
  { id: 'terms', path: '/terms', label: 'Terms of Service', iconName: 'FileText', isPublic: true, disclosureTier: 'essential' },
  { id: 'compliance', path: '/compliance', label: 'Compliance', iconName: 'FileText', isPublic: true, disclosureTier: 'essential' },
  { id: 'security', path: '/security', label: 'Security', iconName: 'FileText', isPublic: true, disclosureTier: 'essential' },
  { id: 'activate', path: '/activate', label: 'Activate', iconName: 'Key', isPublic: true, disclosureTier: 'essential' },
  { id: 'login', path: '/login', label: 'Login', iconName: 'Lock', isPublic: true, disclosureTier: 'essential' },
  { id: 'onboarding', path: '/onboarding/workspace', label: 'Workspace Setup', iconName: 'Building2', disclosureTier: 'essential' },
  { id: 'project-new', path: '/projects/new', label: 'Create Project', iconName: 'PlusCircle', capability: 'manage_projects', disclosureTier: 'essential' },
  { id: 'control-root', path: '/control', label: 'Control', iconName: 'Shield', capability: 'platform_governance', disclosureTier: 'platform' },
  { id: 'settings-notifications', path: '/control/settings/notifications', label: 'Notification Settings', iconName: 'Bell', capability: 'manage_settings', disclosureTier: 'operational' },
  { id: 'settings-modes', path: '/control/settings/modes', label: 'Mode Settings', iconName: 'Sliders', capability: 'manage_settings', disclosureTier: 'operational' },
  { id: 'execution-board', path: '/execution/board', label: 'Execution Board', iconName: 'ListTodo', capability: 'view_tasks', disclosureTier: 'essential' },
  { id: 'execution-gantt', path: '/execution/gantt', label: 'Gantt Workspace', iconName: 'GitBranch', capability: 'view_scheduling', disclosureTier: 'operational' },
  { id: 'execution-sprints', path: '/execution/sprints', label: 'Sprint Center', iconName: 'GitFork', capability: 'view_scheduling', disclosureTier: 'operational' },
];

export const EXACT_APP_PATHS = new Set(CANONICAL_ROUTES.map(r => r.path));

export const SIDEBAR_NAV: SidebarNavItem[] = CANONICAL_ROUTES
  .filter(r => r.group !== undefined)
  .map(r => ({
    id: r.id,
    label: r.label,
    path: r.path,
    group: r.group!,
    capability: r.capability,
    disclosureTier: r.disclosureTier,
    iconName: r.iconName
  }));

export const ROUTE_CAPABILITY_MAP: Record<string, Capability | 'auth'> = CANONICAL_ROUTES.reduce((map, r) => {
  map[r.path] = r.capability || 'auth';
  return map;
}, {} as Record<string, Capability | 'auth'>);

export const PROJECT_SUBROUTES = new Set([
  'setup',
  'backlog',
  'board',
  'sprints',
  'timeline',
]);

export function renderRouteIcon(name: string, className = "w-[15px] h-[15px] shrink-0"): React.ReactNode {
  return React.createElement(RouteIcon, { name, className });
}

import { normalizePath } from './routePaths';
export { normalizePath, ROUTE_ALIASES } from './routePaths';

export function parseProjectRoute(pathname: string): {
  projectId: string;
  subRoute: string | null;
  segments: string[];
} | null {
  if (!pathname.startsWith('/projects/')) return null;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2 || segments[0] !== 'projects') return null;
  const projectId = segments[1];
  const subRoute = segments[2] ?? null;
  return { projectId, subRoute, segments };
}

export function isRegisteredPath(pathname: string): boolean {
  const path = normalizePath(pathname);

  if (EXACT_APP_PATHS.has(path)) return true;

  if (path.startsWith('/workspace/knowledge/') && path.length > '/workspace/knowledge'.length + 1) {
    return true;
  }
  if (path.startsWith('/control/automations/') || path.startsWith('/control/connections/')) {
    return true;
  }

  const project = parseProjectRoute(path);
  if (!project?.projectId) return false;
  if (!project.subRoute) return true;
  if (project.subRoute === 'setup') {
    return project.segments[3] === 'execution';
  }
  return PROJECT_SUBROUTES.has(project.subRoute);
}

function validateSidebarRegistry(): void {
  if (!import.meta.env.DEV) return;
  for (const item of SIDEBAR_NAV) {
    const canonical = normalizePath(item.path);
    if (!EXACT_APP_PATHS.has(canonical)) {
      console.error(`[routeRegistry] Sidebar path not registered: ${item.path} → ${canonical}`);
    }
  }
}

validateSidebarRegistry();
