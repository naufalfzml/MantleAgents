'use client';

import { useState } from 'react';
import { useTimeline } from '@/hooks/use-timeline';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowRightLeft,
  Brain,
  RefreshCw,
  AlertTriangle,
  Search,
  Filter,
  Calendar,
  FileDown,
  Code,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { exportTimelineToCsv } from '@/lib/csv-export';

export function FxAgentTimeline() {
  const { data: timelineData, isLoading } = useTimeline({ limit: 100 });
  const events = timelineData?.entries ?? [];
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  const handleDownloadCsv = () => {
    exportTimelineToCsv(
      events as unknown as Record<string, unknown>[],
      `fx-agent-timeline-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  return (
    <>
      <div className="flex border-2 border-gb-dark bg-gb-deep shadow-[4px_4px_0px_var(--color-gb-deep)] flex-col w-full overflow-hidden h-full">
        {/* Toolbar */}
        <div className="px-3 py-2 border-b border-gb-dark flex flex-col md:flex-row justify-between items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gb-mid size-4" />
              <input
                className="w-full pl-9 pr-3 py-1.5 border-2 border-gb-dark bg-gb-dark/30 text-sm focus:ring-1 focus:ring-gb-accent focus:border-gb-accent text-gb-light placeholder-gb-mid h-9 focus:outline-none"
                placeholder="Search..."
                type="text"
              />
            </div>
            <button type="button" className="flex items-center gap-2 px-3 py-1.5 border-2 border-gb-dark bg-gb-dark/30 text-sm font-medium text-gb-mid hover:bg-gb-dark/50 hover:text-gb-light transition-colors h-9">
              <Filter className="text-gb-mid size-4" />
              <span>Filter</span>
            </button>
            <button type="button" className="flex items-center gap-2 px-3 py-1.5 border-2 border-gb-dark bg-gb-dark/30 text-sm font-medium text-gb-mid hover:bg-gb-dark/50 hover:text-gb-light transition-colors h-9">
              <Calendar className="text-gb-mid size-4" />
              <span>24h</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gb-mid hidden sm:inline-block">{events.length} events</span>
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={events.length === 0}
              className="text-gb-accent hover:text-gb-accent/80 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-1.5"
            >
              <FileDown className="size-4" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-gb-deep shadow-sm ring-1 ring-gb-dark ring-opacity-5">
              <tr className="text-gb-mid text-xs uppercase tracking-wider font-semibold border-b border-gb-dark">
                <th className="pl-4 pr-4 py-3 font-medium w-48">Timestamp</th>
                <th className="px-4 py-3 font-medium w-56">Action</th>
                <th className="px-4 py-3 font-medium">Details</th>
                <th className="px-4 py-3 font-medium w-40 text-right">Impact</th>
                <th className="px-4 py-3 font-medium w-32 text-center">Status</th>
                <th className="pr-4 pl-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gb-dark/50 text-sm">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="h-12">
                    <td className="pl-4 pr-4"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-4"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-4"><Skeleton className="h-4 w-full" /></td>
                    <td className="px-4"><Skeleton className="h-4 w-16 ml-auto" /></td>
                    <td className="px-4"><Skeleton className="h-4 w-20 mx-auto" /></td>
                    <td className="pr-4"><Skeleton className="h-4 w-4" /></td>
                  </tr>
                ))
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gb-mid text-base">No timeline events found.</td>
                </tr>
              ) : (
                events.map((event, index) => {
                  const prevEvent = events[index - 1];
                  const isNewSession = event.runId && (!prevEvent || event.runId !== prevEvent.runId);

                  return (
                    <div key={event.id} style={{ display: 'contents' }}>
                      {isNewSession && (
                        <tr className="bg-gb-accent/5">
                          <td colSpan={6} className="px-4 py-2 border-y border-gb-accent/20">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-1.5 rounded-full bg-gb-accent animate-pulse" />
                              <span className="text-xs font-mono font-medium text-gb-accent uppercase tracking-wider">
                                Session {event.runId?.slice(0, 8)}...
                              </span>
                              <div className="h-px bg-gb-accent/20 flex-1 ml-2" />
                            </div>
                          </td>
                        </tr>
                      )}
                      <TimelineRow
                        event={event}
                        onViewLogs={() => setSelectedEvent(event)}
                      />
                    </div>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col border-gb-dark bg-gb-deep">
          <DialogHeader>
            <DialogTitle className="text-gb-light">Event Logs</DialogTitle>
            <DialogDescription className="text-gb-mid">
              Detailed logs for event {selectedEvent?.id}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-gb-dark/30 p-4 font-mono text-xs border-2 border-gb-dark">
            <pre className="text-gb-light">
              {JSON.stringify(selectedEvent, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TimelineRow({ event, onViewLogs }: { event: any; onViewLogs: () => void }) {
  const date = new Date(event.createdAt);
  const timeAgo = formatDistanceToNow(date, { addSuffix: true });

  let icon = <RefreshCw className="size-4" />;
  let iconBg = 'bg-gray-500/10 border-gray-500/20 text-gray-500';
  let title = 'System Event';
  let impact: React.ReactNode = <span className="text-gb-mid font-mono text-sm">-</span>;
  let statusBadge = (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gb-dark/30 text-gb-mid border border-gb-dark leading-none">
      Logged
    </span>
  );

  if (event.eventType === 'trade') {
    const isBuy = event.direction === 'buy';
    icon = <ArrowRightLeft className="size-4" />;
    iconBg = isBuy
      ? 'bg-green-500/10 border-green-500/20 text-green-500'
      : 'bg-red-500/10 border-red-500/20 text-red-400';
    title = isBuy ? 'Buy Executed' : 'Sell Executed';
    const amount = event.amountUsd ? `$${event.amountUsd.toFixed(2)}` : null;
    if (amount) {
      impact = isBuy
        ? <span className="font-mono font-medium text-emerald-500 text-sm">+{amount}</span>
        : <span className="font-mono font-medium text-red-400 text-sm">-{amount}</span>;
    }
    statusBadge = (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border leading-none ${isBuy ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
        Success
      </span>
    );
  } else if (event.eventType === 'analysis') {
    icon = <Brain className="size-4" />;
    iconBg = 'bg-blue-500/10 border-blue-500/20 text-blue-500';
    title = 'AI Analysis';
    const confidence = event.confidencePct ?? 0;
    impact = (
      <div className="flex items-center justify-end gap-2">
        <div className="w-16 bg-gb-dark rounded-full h-1.5 overflow-hidden">
          <div className="bg-blue-500 h-full rounded-full" style={{ width: `${confidence}%` }} />
        </div>
        <span className="font-mono font-medium text-blue-400 text-sm">{confidence}%</span>
      </div>
    );
    statusBadge = (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 leading-none">
        Done
      </span>
    );
  } else if (event.eventType === 'guardrail') {
    icon = <AlertTriangle className="size-4" />;
    iconBg = 'bg-red-500/10 border-red-500/20 text-red-500';
    title = 'Guardrail Alert';
    impact = <span className="text-red-400 font-mono font-medium text-sm">High</span>;
    statusBadge = (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20 leading-none">
        Fixed
      </span>
    );
  }

  const attestationBadge = event.attestationStatus === 'verified' ? (
    <span className="inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium leading-none text-emerald-400">
      <ShieldCheck className="size-3" />
      Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium leading-none text-amber-300">
      <ShieldAlert className="size-3" />
      Missing
    </span>
  );

  return (
    <tr className="hover:bg-gb-dark/20 transition-colors group h-12 border-b border-gb-dark/50 last:border-0">
      <td className="pl-4 pr-4 py-3 whitespace-nowrap">
        <span className="font-mono text-gb-mid text-sm">{timeAgo}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={cn('w-6 h-6 rounded flex items-center justify-center border shrink-0', iconBg)}>
            {icon}
          </div>
          <span className="font-medium text-gb-light text-sm">{title}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-gb-mid truncate max-w-md text-sm">
            {event.summary ?? event.title}
          </span>
          {event.eventType === 'trade' && (
            <span className="text-[10px] text-gb-mid bg-gb-dark/50 px-1.5 rounded border border-gb-dark">Swap</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right">{impact}</td>
      <td className="px-4 py-3 text-center">
        <div className="flex flex-col items-center gap-1">
          {statusBadge}
          {attestationBadge}
        </div>
      </td>
      <td className="pr-4 pl-4 py-3 text-center">
        <button
          type="button"
          onClick={onViewLogs}
          className="p-1.5 rounded hover:bg-gb-dark/50 text-gb-mid hover:text-gb-light transition-colors"
          title="View Logs"
        >
          <Code className="size-4" />
        </button>
      </td>
    </tr>
  );
}
