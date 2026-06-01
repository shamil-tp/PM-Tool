import React, { useMemo, useState } from 'react';
import { 
  Search, Plus, Activity, AlertTriangle, Clock, 
  Briefcase, Filter, ChevronDown, CheckCircle2,
  TrendingUp, Users, Cpu, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../context/DashboardContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { ProjectCard } from '../../components/project/ProjectCard';
import { hasCapability } from '../../core/auth/permissions';
import { EmptyState } from '../../components/common/EmptyState';

export function ProjectWorkspace() {
  const { workspace, user } = useWorkspace() as any;
  const { projects = [], tasks = [], profiles = [], activeTeams = [], setIsAdding, setSelectedProject, stats } = useDashboard() as any;
  const { profile } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'completed' | 'at_risk'>('active');

  // Real data calculations
  const activeProjects = projects.filter((p: any) => p.status !== 'deployed');
  const completedProjects = projects.filter((p: any) => p.status === 'deployed');
  
  const highRiskProjects = useMemo(() => {
    return activeProjects.filter((p: any) => {
      const pTasks = tasks.filter((t: any) => t.project_id === p.id);
      return pTasks.some((t: any) => t.risk === 'high' && t.status !== 'done');
    });
  }, [activeProjects, tasks]);

  const deliveryConfidence = stats?.deliveryConfidence;

  const filteredProjects = useMemo(() => {
    let filtered = projects;
    
    // Status Filter
    if (filterMode === 'active') filtered = activeProjects;
    else if (filterMode === 'completed') filtered = completedProjects;
    else if (filterMode === 'at_risk') filtered = highRiskProjects;

    // Search Filter
    if (searchTerm) {
      filtered = filtered.filter((p: any) => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    // Sort by recent activity
    return filtered.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [projects, activeProjects, completedProjects, highRiskProjects, filterMode, searchTerm]);

  return (
    <div className="max-w-[1600px] mx-auto pb-12 animate-in fade-in duration-300">
      
      {/* 1. PROJECTS HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8 border-b border-border-subtle pb-6 mt-2">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-2xl font-sans tracking-tight font-medium text-text-primary">Projects</h1>
          </div>
          <p className="text-sm text-text-tertiary">
            Managing projects, progress, teams, timelines, and risks.
            Executive oversight of {workspace?.settings?.companyName || workspace?.name || 'Workspace'}'s execution cycles and delivery timelines.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-4 mr-4 bg-surface-2 px-4 py-2 rounded-lg border border-border">
            <div className="flex flex-col">
              <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide">Confidence</span>
              {deliveryConfidence !== undefined ? (
                <span className={`text-sm font-semibold tracking-tight ${deliveryConfidence > 80 ? 'text-signal-safe' : deliveryConfidence > 50 ? 'text-signal-warning' : 'text-signal-critical'}`}>
                  {deliveryConfidence}%
                </span>
              ) : (
                <span className="inline-block w-8 h-4 bg-[var(--pm-surface)]/10 animate-pulse rounded mt-0.5" />
              )}
            </div>
            <div className="w-px h-6 bg-border-subtle"></div>
            <div className="flex flex-col">
              <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide">Active</span>
              <span className="text-sm font-semibold tracking-tight text-text-primary">{activeProjects.length}</span>
            </div>
          </div>

          {hasCapability(profile?.role, 'manage_projects') && (
            <button
              onClick={() => setIsAdding(true)}
              className="bg-text-primary text-bg px-4 py-2 rounded-md font-medium text-xs flex items-center gap-2 hover:bg-neutral-200 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>New Initiative</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. PROJECTS CONTROLS (Search & Filters) */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
          <button 
            onClick={() => setFilterMode('active')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${filterMode === 'active' ? 'bg-surface-3 text-text-primary shadow-sm border border-border' : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2'}`}
          >
            Active Execution
          </button>
          <button 
            onClick={() => setFilterMode('at_risk')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${filterMode === 'at_risk' ? 'bg-rose-950/30 text-rose-400 border border-rose-500/20 shadow-sm' : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2'}`}
          >
            At Risk
          </button>
          <button 
            onClick={() => setFilterMode('completed')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${filterMode === 'completed' ? 'bg-surface-3 text-text-primary shadow-sm border border-border' : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2'}`}
          >
            Archived
          </button>
          <button 
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${filterMode === 'all' ? 'bg-surface-3 text-text-primary shadow-sm border border-border' : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2'}`}
          >
            All Projects
          </button>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-quaternary" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-md h-9 pl-9 pr-4 text-xs focus:border-border-subtle focus:ring-1 focus:ring-border-subtle outline-none transition-all placeholder:text-text-tertiary"
            />
          </div>
          <button className="h-9 px-3 bg-surface-2 border border-border rounded-md text-text-secondary flex items-center gap-2 hover:bg-surface-3 transition-colors shrink-0">
            <Filter className="w-4 h-4" />
            <span className="text-xs font-medium hidden md:inline">Filters</span>
          </button>
        </div>
      </div>

      {/* 3. PROJECT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
        <AnimatePresence>
          {filteredProjects.map((project: any) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -10 }}
              transition={{ duration: 0.2 }}
              key={project.id}
            >
              <ProjectCard
                project={project}
                teams={activeTeams}
                profiles={profiles}
                tasks={tasks.filter((t: any) => t.project_id === project.id)}
                onClick={setSelectedProject}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredProjects.length === 0 && (
          <div className="col-span-full">
            <EmptyState 
              icon={Briefcase}
              title="No projects created yet"
              description="Create your first project to start tracking work and managing your team."
              actionLabel="Create Project"
              onAction={() => window.location.href='/projects/new'}
            />
          </div>
        )}
      </div>

    </div>
  );
}
