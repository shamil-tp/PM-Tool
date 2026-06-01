import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import { canAccessRoute } from '../core/auth/permissions';
import type { UserRole } from '../types';
import {
  consumeRedirectToAfterAuth,
  resolveAuthenticatedDestination,
} from '../core/auth/postAuthRedirect';
// AuthPage removed — unified to Login component (Bug 6 fix)
import DashboardLayout from '../pages/dashboard/DashboardLayout';
import { AdminPanel } from '../pages/dashboard/AdminPanel';
import { LogisticsPanel } from '../pages/dashboard/LogisticsPanel';
import { WorkspaceSetupWizard } from '../pages/onboarding/WorkspaceSetupWizard';
import { ProjectCreationWizard } from '../pages/project/ProjectCreationWizard';
import { LandingPage } from '../landing/LandingPage';
import { PrivacyPage } from '../landing/PrivacyPage';
import { TermsPage } from '../landing/TermsPage';
import { CompliancePage } from '../landing/CompliancePage';
import { SecurityPage } from '../landing/SecurityPage';
import { Login } from '../components/auth/Login';
import { ProductKeyGate } from '../components/auth/ProductKeyGate';
import { isProductKeyVerified } from '../lib/productKey';
import { normalizePath, parseProjectRoute, isRegisteredPath } from './routeRegistry';

// ── Lazy-loaded route pages ──

const withRetry = (componentImport: () => Promise<any>) => {
  return lazy(async () => {
    try {
      const module = await componentImport();
      sessionStorage.removeItem('chunk_reload_count');
      return module;
    } catch (error: any) {
      console.warn('Failed to load dynamic import:', error);
      if (error?.message?.includes('Failed to fetch dynamically imported module')) {
        const reloadCount = parseInt(sessionStorage.getItem('chunk_reload_count') || '0', 10);
        if (reloadCount < 2) {
          sessionStorage.setItem('chunk_reload_count', (reloadCount + 1).toString());
          window.location.reload();
          return { default: () => <RouteFallback /> };
        }
      }
      return { default: () => <div className="flex items-center justify-center min-h-[50vh] p-8 text-center text-rose-400/80 font-mono text-sm tracking-tight border border-rose-500/10 rounded-lg bg-rose-500/5 max-w-md mx-auto mt-20">System partition failed to load. Please verify connection and refresh.</div> };
    }
  });
};

const OverviewPage = withRetry(() => import('../pages/dashboard/OverviewPage'));
const ProjectsPage = withRetry(() => import('../pages/workspace/ProjectsPage'));
const PortfolioPage = withRetry(() => import('../pages/workspace/PortfolioPage'));
const KnowledgePage = withRetry(() => import('../pages/workspace/KnowledgePage'));
const DecisionsPage = withRetry(() => import('../pages/workspace/DecisionsPage'));
const ExecutiveOverview = withRetry(() => import('../pages/dashboard/ExecutiveOverview').then(m => ({ default: m.ExecutiveOverview })));

const ProductAdoptionDashboard = withRetry(() => import('../pages/workspace/ProductAdoptionDashboard').then(m => ({ default: m.ProductAdoptionDashboard })));
const ReportsCenter = withRetry(() => import('../pages/workspace/ReportsCenter'));

const BoardPage = withRetry(() => import('../pages/execution/BoardPage'));
const TimelinePage = withRetry(() => import('../pages/execution/TimelinePage'));
const GanttPage = withRetry(() => import('../pages/execution/GanttPage'));
const SprintPage = withRetry(() => import('../pages/execution/SprintPage'));

const TeamsPage = withRetry(() => import('../pages/resources/TeamsPage'));
const CapacityPage = withRetry(() => import('../pages/resources/CapacityPage'));
const WorkLogsPage = withRetry(() => import('../pages/resources/WorkLogsPage'));
const FinancePage = withRetry(() => import('../pages/resources/FinancePage'));

const AnalyticsPage = withRetry(() => import('../pages/control/AnalyticsPage'));
const AuditPage = withRetry(() => import('../pages/control/AuditPage'));
const DocumentTemplatesPage = withRetry(() => import('../pages/control/DocumentTemplatesPage'));
const ObservabilityPanel = withRetry(() => import('../pages/dashboard/ObservabilityPanel').then(m => ({ default: m.ObservabilityPanel })));
const SettingsPage = withRetry(() => import('../pages/control/SettingsPage'));

const DocumentView = withRetry(() => import('../pages/dashboard/DocumentView'));
const AutomationsPanel = withRetry(() => import('../pages/dashboard/AutomationsPanel'));
const ConnectionsPanel = withRetry(() => import('../pages/dashboard/ConnectionsPanel'));
const NotificationSettings = withRetry(() => import('../pages/dashboard/NotificationSettings'));
const ModeSettings = withRetry(() => import('../pages/dashboard/ModeSettings'));
const MissionControlPage = withRetry(() => import('../pages/mission-control/MissionControlPage'));

const ExecutionSetupPage = withRetry(() => import('../pages/setup/ExecutionSetupPage'));
const BacklogPage = withRetry(() => import('../pages/backlog/BacklogPage'));
const ProjectBoardPage = withRetry(() => import('../pages/board/ProjectBoardPage'));
const ProjectSprintPage = withRetry(() => import('../pages/sprints/ProjectSprintPage'));
const ProjectTimelinePage = withRetry(() => import('../pages/timeline/ProjectTimelinePage'));

const DEFAULT_AUTH_REDIRECT = '/overview';

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-white" />
    </div>
  );
}

function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', update);

    const originalPushState = window.history.pushState;
    window.history.pushState = function pushState(...args) {
      originalPushState.apply(window.history, args);
      update();
    };

    return () => {
      window.removeEventListener('popstate', update);
      window.history.pushState = originalPushState;
    };
  }, []);

  return pathname;
}

function redirectTo(target: string): void {
  window.history.replaceState(null, '', target);
  window.dispatchEvent(new CustomEvent('popstate'));
}

function Redirect({ to }: { to: string }) {
  useEffect(() => {
    console.log("[Redirect component] redirecting to:", to, "from:", window.location.pathname);
    redirectTo(to);
  }, [to]);
  return null;
}

function guardRoute(role: UserRole | undefined, path: string): boolean {
  return canAccessRoute(role, path);
}

function RouteShell({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </DashboardLayout>
  );
}

export function ResolveRouter() {
  const rawPathname = usePathname();
  const pathname = normalizePath(rawPathname);
  const { user, workspace, loading: workspaceLoading } = useWorkspace();
  const { profile, loading: authLoading, profileResolved, profileHydrating } = useAuth();
  const role = profile?.role;
  const postAuthRedirectApplied = useRef(false);

  useEffect(() => {
    if (postAuthRedirectApplied.current) return;
    if (workspaceLoading || authLoading || !profileResolved || profileHydrating) return;
    if (!user || !profile || role === 'uninvited') return;

    const stored = consumeRedirectToAfterAuth();
    if (!stored) return;

    postAuthRedirectApplied.current = true;
    const destination = resolveAuthenticatedDestination(role, !!workspace, stored);
    const target = normalizePath(destination);
    if (target !== pathname) {
      redirectTo(target);
    }
  }, [
    workspaceLoading,
    authLoading,
    profileResolved,
    profileHydrating,
    user,
    profile,
    role,
    workspace,
    pathname,
  ]);

  useEffect(() => {
    /* 
    console.log("[ResolveRouter START] Current state:", {
      pathname,
      workspaceId: workspace?.id,
      userId: user?.id,
      role,
      workspaceLoading,
      authLoading,
      profileResolved,
      profileHydrating,
      productKeyVerified: isProductKeyVerified()
    });
    */
  }, [pathname, workspace, user, role, workspaceLoading, authLoading, profileResolved, profileHydrating]);

  // ── Public routes ──

  if (pathname === '/') {
    return <LandingPage />;
  }

  if (pathname === '/privacy') {
    return <PrivacyPage />;
  }

  if (pathname === '/terms') {
    return <TermsPage />;
  }

  if (pathname === '/compliance') {
    return <CompliancePage />;
  }

  if (pathname === '/security') {
    return <SecurityPage />;
  }

  if (pathname === '/activate') {
    return (
      <ProductKeyGate
        onVerified={() => {
          window.history.pushState(null, '', '/overview');
          window.dispatchEvent(new Event('popstate'));
        }}
      />
    );
  }

  if (pathname === '/login') {
    console.log("[ResolveRouter] Routing to /login explicitly");
    return <Login />;
  }

  if (workspaceLoading || authLoading || !profileResolved || profileHydrating) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface">
        <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Auth Gate ──
  // The system uses a post-auth verification model (Product Key OR Invitation).
  // Unauthenticated users are sent to login, where they will authenticate
  // and then be validated by the reconcileInvitationMembership core logic.

  if (!user) return <Login />;

  if (role === 'uninvited' || !role) {
    return <Redirect to="/login?error=uninvited" />;
  }

  if (!workspace && role === 'pending-workspace-setup') {
    return <WorkspaceSetupWizard />;
  }

  if (!workspace) {
    return <Redirect to="/login?error=uninvited" />;
  }

  // ── Alias redirects (canonicalize) ──

  const rawStripped = rawPathname.split('?')[0].replace(/\/+$/, '') || '/';
  if (rawStripped !== pathname) {
    return <Redirect to={pathname} />;
  }

  // ── Legacy redirects ──

  if (rawPathname === '/projects/new' || pathname === '/projects/new') {
    if (!guardRoute(role, '/projects/new')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><ProjectCreationWizard /></RouteShell>;
  }

  if (pathname === '/onboarding/workspace') {
    return <WorkspaceSetupWizard />;
  }

  // ── OVERVIEW ──

  if (pathname === '/overview') {
    return <RouteShell><OverviewPage /></RouteShell>;
  }

  // ── WORKSPACE ──

  if (pathname === '/workspace') {
    return <RouteShell><ProjectsPage /></RouteShell>;
  }
  if (pathname === '/workspace/portfolio') {
    if (!guardRoute(role, '/workspace/portfolio')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><PortfolioPage /></RouteShell>;
  }
  if (pathname === '/workspace/executive') {
    if (!guardRoute(role, '/workspace/executive')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><ExecutiveOverview /></RouteShell>;
  }
  if (pathname === '/workspace/reports') {
    if (!guardRoute(role, '/workspace/reports')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><ReportsCenter /></RouteShell>;
  }
  if (pathname === '/workspace/knowledge') {
    return <RouteShell><KnowledgePage /></RouteShell>;
  }
  if (pathname.startsWith('/workspace/knowledge/')) {
    return <RouteShell><DocumentView /></RouteShell>;
  }
  if (pathname === '/workspace/decisions') {
    if (!guardRoute(role, '/workspace/decisions')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><DecisionsPage /></RouteShell>;
  }

  // ── EXECUTION ──

  if (pathname === '/execution' || pathname === '/execution/board') {
    if (!guardRoute(role, '/execution')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><BoardPage /></RouteShell>;
  }
  if (pathname === '/execution/timeline') {
    if (!guardRoute(role, '/execution/timeline')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><TimelinePage /></RouteShell>;
  }
  if (pathname === '/execution/gantt') {
    if (!guardRoute(role, '/execution/gantt')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><GanttPage /></RouteShell>;
  }
  if (pathname === '/execution/sprints') {
    if (!guardRoute(role, '/execution/sprints')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><SprintPage /></RouteShell>;
  }

  // ── RESOURCES ──

  if (pathname === '/resources' || pathname === '/resources/attendance' || pathname === '/resources/payroll') {
    if (!guardRoute(role, '/resources')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><LogisticsPanel /></RouteShell>;
  }
  if (pathname === '/resources/teams') {
    if (!guardRoute(role, '/resources/teams')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><TeamsPage /></RouteShell>;
  }
  if (pathname === '/resources/capacity') {
    if (!guardRoute(role, '/resources/capacity')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><CapacityPage /></RouteShell>;
  }
  if (pathname === '/resources/work-logs') {
    if (!guardRoute(role, '/resources/work-logs')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><WorkLogsPage /></RouteShell>;
  }
  if (pathname === '/resources/finance') {
    if (!guardRoute(role, '/resources/finance')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><FinancePage /></RouteShell>;
  }

  // ── CONTROL ──

  if (pathname === '/control' || pathname === '/control/identity') {
    if (!guardRoute(role, '/control')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><AdminPanel /></RouteShell>;
  }
  if (pathname === '/control/analytics') {
    if (!guardRoute(role, '/control/analytics')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><AnalyticsPage /></RouteShell>;
  }
  if (pathname === '/control/audit') {
    if (!guardRoute(role, '/control/audit')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><AuditPage /></RouteShell>;
  }
  if (pathname === '/control/document-templates') {
    if (!guardRoute(role, '/control/document-templates')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><DocumentTemplatesPage /></RouteShell>;
  }
  if (pathname === '/control/system-health') {
    if (!guardRoute(role, '/control')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><ObservabilityPanel /></RouteShell>;
  }
  if (pathname === '/control/automations' || pathname.startsWith('/control/automations/')) {
    if (!guardRoute(role, '/control/automations')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><AutomationsPanel /></RouteShell>;
  }
  if (pathname === '/control/connections' || pathname.startsWith('/control/connections/')) {
    if (!guardRoute(role, '/control/connections')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><ConnectionsPanel /></RouteShell>;
  }
  if (pathname === '/control/settings') {
    if (!guardRoute(role, '/control/settings')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><SettingsPage /></RouteShell>;
  }
  if (pathname === '/control/settings/notifications') {
    if (!guardRoute(role, '/control/settings/notifications')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><NotificationSettings /></RouteShell>;
  }
  if (pathname === '/control/settings/modes') {
    if (!guardRoute(role, '/control/settings/modes')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><ModeSettings /></RouteShell>;
  }
  if (pathname === '/control/mission-control') {
    if (!guardRoute(role, '/control/mission-control')) return <Redirect to={DEFAULT_AUTH_REDIRECT} />;
    return <RouteShell><MissionControlPage /></RouteShell>;
  }

  // ── PROJECT routes (/projects/:id/...) ──

  const projectRoute = parseProjectRoute(pathname);
  if (projectRoute?.projectId) {
    const { subRoute, segments } = projectRoute;

    if (!subRoute) {
      return <Redirect to={`/projects/${projectRoute.projectId}/board`} />;
    }

    if (subRoute === 'setup' && segments[3] === 'execution') {
      return <RouteShell><ExecutionSetupPage /></RouteShell>;
    }
    if (subRoute === 'backlog') {
      return <RouteShell><BacklogPage /></RouteShell>;
    }
    if (subRoute === 'board') {
      return <RouteShell><ProjectBoardPage /></RouteShell>;
    }
    if (subRoute === 'sprints') {
      return <RouteShell><ProjectSprintPage /></RouteShell>;
    }
    if (subRoute === 'timeline') {
      return <RouteShell><ProjectTimelinePage /></RouteShell>;
    }

    return <Redirect to={`/projects/${projectRoute.projectId}/board`} />;
  }

  // ── Fallback: unknown paths → overview (registered 404 behavior) ──
  if (import.meta.env.DEV && !isRegisteredPath(pathname)) {
    console.warn(`[ResolveRouter] Unregistered path, falling back to overview: ${rawPathname}`);
  }
  return <RouteShell><OverviewPage /></RouteShell>;
}
