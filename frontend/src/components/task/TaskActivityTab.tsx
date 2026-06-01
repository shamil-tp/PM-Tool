import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { activityLogService, ActivityLogEntry } from '../../services/activityLogService';

interface TaskActivityTabProps {
  taskId: string;
}

export function TaskActivityTab({ taskId }: TaskActivityTabProps) {
  const { workspace } = useWorkspace() as any;
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (workspace?.id) {
      loadActivity();
    }
  }, [taskId, workspace?.id]);

  const loadActivity = async () => {
    setLoading(true);
    try {
      const data = await activityLogService.getLogs(workspace.id, undefined, taskId);
      // Filter out non-system/system-generated tasks lifecycle stuff if necessary
      // "Task lifecycle events. System-generated only."
      // Typically `activityLogService` logs are system-generated.
      // We reverse it to show newest last, but the prompt says "Newest last" for comments, what about activity?
      // Wait, "Newest last" was under "PART 2 TASK DISCUSSION PANEL", so for activity we will just keep default (newest first or last).
      // Let's do newest last to match discussion. 
      // activityLogService.getLogs returns oldest first, so we keep the order.
      setLogs(data);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-[10px] text-text-quaternary font-mono text-center mt-10">Loading activity...</div>;
  }

  if (logs.length === 0) {
    return <div className="text-[10px] text-text-quaternary font-mono text-center mt-10">No activity recorded yet.</div>;
  }

  return (
    <div className="flex flex-col h-[400px] overflow-y-auto space-y-4 p-2 mb-4">
      {logs.map((log, index) => (
        <div key={log.id || index} className="flex gap-3">
          <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-text-tertiary shrink-0" />
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-mono font-medium text-text-primary capitalize">
                {log.action.replace(/_/g, ' ')}
              </span>
              <span className="text-[9px] font-mono text-text-quaternary">
                {log.created_at ? new Date(log.created_at).toLocaleString() : 'Not Recorded'}
              </span>
            </div>
            {Object.keys(log.metadata || {}).length > 0 && (
              <pre className="text-[8px] font-mono text-text-tertiary bg-surface p-1.5 mt-1 rounded overflow-x-auto">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
