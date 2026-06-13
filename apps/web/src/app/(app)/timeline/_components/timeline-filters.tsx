'use client';

import type { TimelineEventType } from '@mantleagents/shared';
import { cn } from '@/lib/utils';

interface TimelineFiltersProps {
  activeFilter: TimelineEventType | undefined;
  onFilterChange: (type: TimelineEventType | undefined) => void;
}

const FILTERS: Array<{ value: TimelineEventType | undefined; label: string }> = [
  { value: undefined, label: 'All' },
  { value: 'trade', label: 'Trades' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'guardrail', label: 'Guardrail' },
  { value: 'funding', label: 'Funding' },
  { value: 'system', label: 'System' },
];

export function TimelineFilters({ activeFilter, onFilterChange }: TimelineFiltersProps) {
  return (
    <div className="inline-flex gap-1 rounded-lg bg-muted/50 p-1">
      {FILTERS.map((f) => {
        const isActive = activeFilter === f.value;
        return (
          <button
            key={f.label}
            onClick={() => onFilterChange(f.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-all cursor-pointer',
              isActive
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
