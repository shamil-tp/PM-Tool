import { motion } from 'motion/react';
import { slideUp } from '../../lib/animation';

interface EmptyAction {
  label: string;
  onClick: () => void;
}

interface WidgetCardProps {
  title: string;
  children: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: string;
  emptyAction?: EmptyAction;
  action?: React.ReactNode;
  className?: string;
}

export function WidgetCard({ title, children, loading, error, empty, emptyMessage, emptyAction, action, className = '' }: WidgetCardProps) {
  return (
    <motion.div variants={slideUp} initial="hidden" animate="visible" className={`bg-surface-3/50 backdrop-blur-md border border-border/50 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-surface/50">
        <h3 className="text-xs font-bold tracking-widest text-text-secondary uppercase">{title}</h3>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      <div className="p-5">
        {loading ? (
          <div className="space-y-3">
            <div className="h-3 bg-surface-3 rounded-full transition-opacity duration-300" />
            <div className="h-3 bg-surface-3 rounded-full w-3/4 transition-opacity duration-300" />
            <div className="h-3 bg-surface-3 rounded-full w-1/2 transition-opacity duration-300" />
          </div>
        ) : error ? (
          <div className="text-xs text-red-400 font-bold bg-red-500/10 border border-red-500/20 p-3 rounded-xl">{error}</div>
        ) : empty ? (
          <div className="text-center py-8">
            <p className="text-xs font-semibold text-text-quaternary mb-4">{emptyMessage || 'We need more data to show these insights.'}</p>
            {emptyAction && (
              <button
                onClick={emptyAction.onClick}
                className="text-[10px] font-bold tracking-wider text-blue-400 hover:text-blue-300 transition-all border border-blue-500/20 rounded-lg px-3 py-1.5 hover:bg-blue-500/10 uppercase shadow-inner"
              >
                {emptyAction.label} →
              </button>
            )}
          </div>
        ) : children}
      </div>
    </motion.div>
  );
}
