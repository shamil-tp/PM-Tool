interface TransitionImpactPreviewProps {
  currentMode: string;
  targetMode: string;
  hasTasks: boolean;
  hasSprints: boolean;
}

interface ImpactChange {
  label: string;
  willChange: boolean;
  description: string;
}

export function TransitionImpactPreview({ currentMode, targetMode, hasTasks, hasSprints }: TransitionImpactPreviewProps) {
  const isKanbanToScrum = currentMode === 'KANBAN' && targetMode === 'SCRUM';
  const isScrumToKanban = currentMode === 'SCRUM' && targetMode === 'KANBAN';

  const changes: ImpactChange[] = [
    {
      label: 'execution board',
      willChange: true,
      description: isKanbanToScrum
        ? 'Kanban board archived — sprint lifecycle initialized'
        : 'Sprint view archived — continuous flow board activated',
    },
    {
      label: 'backlog planning',
      willChange: isKanbanToScrum,
      description: isKanbanToScrum
        ? 'Backlog planning activated with sprint-scoped refinement'
        : 'Unchanged — backlog remains accessible',
    },
    {
      label: 'sprint lifecycle',
      willChange: isKanbanToScrum,
      description: isKanbanToScrum
        ? 'Sprint lifecycle initialized — velocity tracking enabled'
        : 'Sprint lifecycle deactivated — continuous flow active',
    },
    {
      label: 'velocity tracking',
      willChange: isKanbanToScrum,
      description: isKanbanToScrum
        ? 'Velocity forecasting enabled — sprint commitment tracking'
        : 'Velocity tracking disabled — throughput metrics used',
    },
    {
      label: 'coordination data',
      willChange: true,
      description: 'Coordination signals recalibrated for new execution mode',
    },
    {
      label: 'task history',
      willChange: false,
      description: 'All existing task history preserved',
    },
    {
      label: 'audit chain',
      willChange: false,
      description: 'Activity log integrity maintained',
    },
    {
      label: 'dependency relationships',
      willChange: false,
      description: 'All dependency mappings preserved',
    },
  ];

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-mono text-text-quaternary mb-2">
        This project will transition from <span className="text-text-secondary">{currentMode}</span> to <span className="text-text-secondary">{targetMode}</span> execution mode.
      </p>

      {isKanbanToScrum && hasTasks && (
        <div className="px-2 py-1.5 bg-signal-warning-bg border border-border rounded mb-2">
          <p className="text-[9px] font-mono text-signal-warning">
            {hasSprints
              ? 'Existing sprints will be preserved and recalibrated for the new workflow.'
              : 'No sprints detected — sprint initialization will be required after transition.'}
          </p>
        </div>
      )}

      <div className="space-y-0.5">
        {changes.map(c => (
          <div key={c.label} className="flex items-start gap-2 py-0.5">
            <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${c.willChange ? 'bg-blue-400' : 'bg-surface-highest'}`} />
            <div className="min-w-0">
              <span className="text-[10px] font-mono text-text-tertiary">{c.label}</span>
              <span className="text-[9px] font-mono text-text-quaternary ml-1">— {c.description}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
