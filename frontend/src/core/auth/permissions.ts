import { normalizePath } from '../../app/routePaths';
import type { UserRole } from '../../types';

/**
 * Canonical capabilities — single source of operational authority.
 */
export type Capability =
  | 'view_projects'
  | 'manage_projects'
  | 'view_tasks'
  | 'manage_tasks'
  | 'view_scheduling'
  | 'manage_scheduling'
  | 'view_analytics'
  | 'view_decision_center'
  | 'view_reports'
  | 'manage_logistics'
  | 'view_teams'
  | 'manage_teams'
  | 'view_stakeholders'
  | 'view_audit_log'
  | 'manage_settings'
  | 'manage_integrations'
  | 'manage_automations'
  | 'manage_compensation'
  | 'platform_governance'
  | 'platform_security'
  | 'manage_finance'
  | 'view_mission_control';

const VIEW_CAPABILITIES: Capability[] = [
  'view_projects',
  'view_tasks',
  'view_analytics',
  'view_decision_center',
  'view_reports',
  'view_teams',
  'view_stakeholders',
  'view_audit_log',
];

/**
 * Role → capability matrix (canonical).
 *
 * PM: operational leadership — settings, integrations, logistics, analytics, delivery systems.
 * Developer: execution / sprint / task delivery focus.
 * Viewer: read-only operational visibility.
 * Super Admin: full platform including governance & security.
 */
const ROLE_CAPABILITIES: Record<UserRole, Capability[]> = {
  super_admin: [
    'view_projects',
    'manage_projects',
    'view_tasks',
    'manage_tasks',
    'view_scheduling',
    'manage_scheduling',
    'view_analytics',
    'view_decision_center',
    'view_reports',
    'manage_logistics',
    'view_teams',
    'manage_teams',
    'view_stakeholders',
    'view_audit_log',
    'manage_settings',
    'manage_integrations',
    'manage_automations',
    'manage_compensation',
    'manage_finance',
    'platform_governance',
    'platform_security',
    'view_mission_control',
  ],
  pm: [
    'view_projects',
    'manage_projects',
    'view_tasks',
    'manage_tasks',
    'view_scheduling',
    'manage_scheduling',
    'view_analytics',
    'view_decision_center',
    'view_reports',
    'manage_logistics',
    'view_teams',
    'manage_teams',
    'view_stakeholders',
    'manage_settings',
    'manage_integrations',
    'manage_automations',
  ],
  developer: [
    'view_projects',
    'view_tasks',
    'manage_tasks',
    'view_scheduling',
    'view_teams',
  ],
  viewer: [...VIEW_CAPABILITIES],
  uninvited: [],
  'pending-workspace-setup': [],
};

import { ROUTE_CAPABILITY_MAP } from '../../app/routeRegistry';


export function hasCapability(role: UserRole | undefined, capability: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

export function isOperationalReadOnly(role: UserRole | undefined): boolean {
  if (!role) return true;
  return hasCapability(role, 'view_projects') && !hasCapability(role, 'manage_tasks') && !hasCapability(role, 'manage_projects');
}

export function hasAnyCapability(role: UserRole | undefined, capabilities: Capability[]): boolean {
  return capabilities.some(c => hasCapability(role, c));
}

export function canWriteOperationally(role: UserRole | undefined): boolean {
  if (!role || !hasCapability(role, 'view_projects')) return false;
  return !isOperationalReadOnly(role);
}

export function getCapabilities(role: UserRole | undefined): Capability[] {
  if (!role) return [];
  return ROLE_CAPABILITIES[role] ?? [];
}

export function canAccessRoute(role: UserRole | undefined, pathname: string): boolean {
  if (!role || !hasCapability(role, 'view_projects')) return false;

  const path = normalizePath(pathname);
  const required = ROUTE_CAPABILITY_MAP[path];

  if (required === 'auth') return true;
  if (!required) {
    if (path.startsWith('/projects/')) {
      return hasCapability(role, 'view_tasks');
    }
    if (path.startsWith('/workspace/knowledge/')) {
      return hasCapability(role, 'view_projects');
    }
    return false;
  }

  return hasCapability(role, required);
}

// Fix 5: Rate Limiting & Abuse Resilience (Frontend mutation governance)
const mutationTimestamps: number[] = [];
const MAX_MUTATIONS_PER_10S = 30;

export function guardCapability(
  role: UserRole | undefined,
  capability: Capability,
  operationName?: string,
): void {
  if (operationName) {
    const now = Date.now();
    mutationTimestamps.push(now);
    
    // Clean up timestamps older than 10 seconds
    while (mutationTimestamps.length > 0 && mutationTimestamps[0] < now - 10000) {
      mutationTimestamps.shift();
    }
    
    if (mutationTimestamps.length > MAX_MUTATIONS_PER_10S) {
      const msg = `Rate Limit Exceeded: Too many operational mutations requested. Please wait before retrying.`;
      console.warn(`[Guard] ${msg}`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notify-toast', { detail: { message: msg, type: 'error' } }));
      }
      throw new Error(msg);
    }
  }

  if (!hasCapability(role, capability)) {
    const msg = `Unauthorized: capability "${capability}" required${operationName ? ` for ${operationName}` : ''}.`;
    console.error(`[Guard] ${msg}`);
    throw new Error(msg);
  }
}
