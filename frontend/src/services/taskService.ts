import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { activityLogService } from './activityLogService';
import { logServiceFailure } from '../utils/supabaseError';

export interface CreateTaskInput {
  workspace_id: string;
  project_id: string;
  epic_id?: string;
  name: string;
  status?: string;
  priority?: string;
  estimated_hours?: number;
  story_points?: number;
  assignee_id?: string;
  synthetic?: boolean;
  runId?: string;
  recurrence_type?: string;
  recurrence_rule?: any;
}

export async function createTask(input: CreateTaskInput): Promise<{ id: string } | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        workspace_id: input.workspace_id,
        project_id: input.project_id,
        epic_id: input.epic_id || null,
        name: input.name,
        status: input.status || 'backlog',
        priority: input.priority || 'medium',
        estimated_hours: input.estimated_hours ?? 0,
        story_points: input.story_points ?? 0,
        assignee_id: input.assignee_id || null,
      })
      .select('id')
      .maybeSingle();
    if (error) { logServiceFailure('createTask', input, error); return null; }
    if (data) {
      // If recurring, setup the template
      if (input.recurrence_type && input.recurrence_type !== 'none') {
        const nextRun = new Date();
        if (input.recurrence_type === 'daily') nextRun.setDate(nextRun.getDate() + 1);
        else if (input.recurrence_type === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
        else if (input.recurrence_type === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);
        else if (input.recurrence_type === 'yearly') nextRun.setFullYear(nextRun.getFullYear() + 1);
        else nextRun.setDate(nextRun.getDate() + 7); // custom default

        const { data: userData } = await supabase.auth.getUser();
        
        const { data: template } = await supabase.from('recurring_task_templates').insert({
          workspace_id: input.workspace_id,
          project_id: input.project_id,
          title: input.name,
          description: null,
          created_by: userData.user?.id,
          assigned_to: input.assignee_id || null,
          recurrence_type: input.recurrence_type,
          recurrence_rule: input.recurrence_rule || null,
          next_run_at: nextRun.toISOString()
        }).select('id').maybeSingle();

        if (template) {
          await supabase.from('recurring_task_history').insert({
            template_id: template.id,
            generated_task_id: data.id
          });
        }
      }

      await activityLogService.appendLog({
        workspace_id: input.workspace_id,
        action: 'task_created',
        metadata: { task_id: data.id, project_id: input.project_id, name: input.name, synthetic: input.synthetic, run_id: input.runId },
      });
      return data;
    }
  } catch (err) { logServiceFailure('createTask', input, err); }
  return null;
}

export async function createTaskDependency(input: {
  workspace_id: string;
  task_id: string;
  depends_on_task_id: string;
}): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from('task_dependencies')
      .upsert({
        workspace_id: input.workspace_id,
        task_id: input.task_id,
        depends_on_task_id: input.depends_on_task_id,
      }, { onConflict: 'workspace_id,task_id,depends_on_task_id' });
    if (error) { logServiceFailure('createTaskDependency', input, error); return false; }
    return true;
  } catch (err) { logServiceFailure('createTaskDependency', input, err); return false; }
}

export async function archiveTask(taskId: string, workspaceId: string, actorId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const now = new Date().toISOString();

    // 1. Archive the task
    await supabase.from('tasks').update({ status: 'archived', deleted_at: now }).eq('id', taskId);

    // 2. Archive associated wait states
    await supabase.from('wait_states').update({ status: 'archived', deleted_at: now }).eq('target_type', 'task').eq('target_id', taskId).is('deleted_at', null);

    // 3. Deactivate (delete) related dependency edges to prevent ghost dependencies
    await supabase.from('task_dependencies').delete().eq('task_id', taskId);
    await supabase.from('task_dependencies').delete().eq('depends_on_task_id', taskId);

    // Audit
    await activityLogService.appendLog({
      workspace_id: workspaceId,
      actor_id: actorId,
      action: 'task_archived',
      metadata: { task_id: taskId, cascade_triggered: true, dependencies_pruned: true },
    });

    return true;
  } catch (err) { 
    logServiceFailure('archiveTask', { taskId }, err); 
    return false;
  }
}
