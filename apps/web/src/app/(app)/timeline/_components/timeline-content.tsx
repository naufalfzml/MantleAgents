'use client';

import { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import type { TimelineEventType } from '@mantleagents/shared';
import { useTimeline } from '@/hooks/use-timeline';
import { useMotionSafe } from '@/lib/motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';
import { TimelineFilters } from './timeline-filters';
import { TimelineEntry, TimelineNode, GROUP_NODE_CONFIG } from './timeline-entry';

const LIMIT = 20;

type Entry = NonNullable<ReturnType<typeof useTimeline>['data']>['entries'][number];

/* ------------------------------------------------------------------ */
/*  Run grouping                                                       */
/* ------------------------------------------------------------------ */

interface RunGroup {
  runId: string;
  entries: Entry[];
  createdAt: string;
  summary: string;
}

type GroupedItem = RunGroup | Entry;

function groupByRun(entries: Entry[]): GroupedItem[] {
  const groups = new Map<string, Entry[]>();
  const result: GroupedItem[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (entry.runId) {
      if (!groups.has(entry.runId)) {
        groups.set(entry.runId, []);
      }
      groups.get(entry.runId)!.push(entry);
    }
  }

  for (const entry of entries) {
    if (entry.runId && groups.has(entry.runId) && !seen.has(entry.runId)) {
      seen.add(entry.runId);
      const groupEntries = groups.get(entry.runId)!;
      if (groupEntries.length === 1) {
        result.push(groupEntries[0]);
      } else {
        const analysis = groupEntries.find((e) => e.eventType === 'analysis');
        const trades = groupEntries.filter((e) => e.eventType === 'trade');
        let summary = analysis?.summary ?? 'Agent run';
        if (trades.length > 0) {
          summary += ` — ${trades.length} trade${trades.length > 1 ? 's' : ''}`;
        }
        result.push({
          runId: entry.runId,
          entries: groupEntries,
          createdAt: groupEntries[0].createdAt,
          summary,
        });
      }
    } else if (!entry.runId) {
      result.push(entry);
    }
  }

  return result;
}

function isRunGroup(item: GroupedItem): item is RunGroup {
  return 'entries' in item && Array.isArray(item.entries) && 'runId' in item && !('eventType' in item);
}

/* ------------------------------------------------------------------ */
/*  Run group component                                                */
/* ------------------------------------------------------------------ */

function RunGroupCard({ group }: { group: RunGroup }) {
  const m = useMotionSafe();
  const [expanded, setExpanded] = useState(false);

  const card = (
    <div
      className="rounded-xl border border-primary/20 bg-primary/5 cursor-pointer transition-colors"
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={() => setExpanded(!expanded)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setExpanded(!expanded);
        }
      }}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-snug line-clamp-1 font-medium">
            {group.summary}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(group.createdAt)}
            </span>
            <Badge className="text-[11px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30" variant="outline">
              {group.entries.length} events
            </Badge>
          </div>
        </div>
        <ChevronDown
          className={cn(
            'size-4 text-muted-foreground transition-transform shrink-0 mt-1',
            expanded && 'rotate-180',
          )}
        />
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: m.duration.fast }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 border-t border-primary/10 pt-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="timeline-spine timeline-spine--compact">
                {group.entries.map((entry) => (
                  <TimelineEntry key={entry.id} entry={entry} compact />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="timeline-item">
      <div className="timeline-node-col">
        <TimelineNode config={GROUP_NODE_CONFIG} />
      </div>
      <div className="timeline-card-col">{card}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TimelineContent                                                    */
/* ------------------------------------------------------------------ */

export function TimelineContent() {
  return (
    <Suspense fallback={<TimelineSkeleton />}>
      <TimelineInner />
    </Suspense>
  );
}

function TimelineInner() {
  const m = useMotionSafe();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeFilter = (searchParams.get('type') as TimelineEventType) || undefined;
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useTimeline({
    type: activeFilter,
    limit: LIMIT,
    offset,
  });

  const total = data?.total ?? 0;
  const hasMore = data?.hasMore ?? false;

  // Append new entries when data changes
  useEffect(() => {
    if (!data?.entries?.length) return;

    setAllEntries((prev) => {
      const existingIds = new Set(prev.map((e) => e.id));
      const newEntries = data.entries.filter((e) => !existingIds.has(e.id));
      if (newEntries.length === 0) return prev;
      return [...prev, ...newEntries];
    });
  }, [data]);

  const handleFilterChange = useCallback(
    (type: TimelineEventType | undefined) => {
      setAllEntries([]);
      setOffset(0);

      const params = new URLSearchParams(searchParams.toString());
      if (type) {
        params.set('type', type);
      } else {
        params.delete('type');
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams]
  );

  const loadMore = useCallback(() => {
    setOffset((prev) => prev + LIMIT);
  }, []);

  const grouped = useMemo(() => groupByRun(allEntries), [allEntries]);

  return (
    <motion.div {...m.fadeUp} transition={m.spring}>
      <div className="flex items-center justify-between mb-6">
        <span className="text-sm text-muted-foreground font-mono tabular-nums">
          {total} events
        </span>
      </div>

      <TimelineFilters activeFilter={activeFilter} onFilterChange={handleFilterChange} />

      <div className={cn('mt-6', isLoading && allEntries.length === 0 ? 'space-y-3' : 'timeline-spine')}>
        {isLoading && allEntries.length === 0
          ? Array.from({ length: 8 }).map((_, i) => <EntrySkeleton key={i} />)
          : grouped.map((item) =>
              isRunGroup(item) ? (
                <RunGroupCard key={item.runId} group={item} />
              ) : (
                <TimelineEntry key={item.id} entry={item} />
              ),
            )}
      </div>

      {hasMore && !isLoading && (
        <Button onClick={loadMore} variant="outline" className="mt-6 w-full">
          Load More
        </Button>
      )}

      {isLoading && allEntries.length > 0 && (
        <div className="mt-6 flex justify-center">
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      )}

      {!isLoading && allEntries.length === 0 && (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <p className="text-sm text-muted-foreground text-center">
              No events found.
              {activeFilter && ' Try clearing the filter.'}
            </p>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

function EntrySkeleton() {
  return (
    <div className="flex items-start gap-3">
      <Skeleton className="size-8 rounded-full shrink-0" />
      <div className="flex-1 rounded-xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-16 rounded-full" />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <EntrySkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
