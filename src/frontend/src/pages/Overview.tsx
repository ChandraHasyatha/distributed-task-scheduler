import React from 'react';
import { SystemMetrics, Queue } from '../types/index.js';
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Cpu,
  Zap,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';

interface OverviewProps {
  metrics: SystemMetrics | null;
  queues: Queue[];
  onSelectTab: (tab: any) => void;
}

export const Overview: React.FC<OverviewProps> = ({ metrics, queues, onSelectTab }) => {
  const cards = [
    {
      title: 'Total Enqueued',
      value: metrics?.totalJobs ?? 0,
      icon: Layers,
      color: 'text-sky-400',
      bgColor: 'bg-sky-500/10',
      borderColor: 'border-sky-500/20',
      sub: `${metrics?.queuedJobs ?? 0} waiting in queue`,
    },
    {
      title: 'Active In-Flight',
      value: metrics?.runningJobs ?? 0,
      icon: Zap,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      sub: `Running across ${metrics?.activeWorkers ?? 0} workers`,
    },
    {
      title: 'Completed Jobs',
      value: metrics?.completedJobs ?? 0,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      sub: `Avg Duration: ${metrics?.avgDurationMs ?? 0}ms`,
    },
    {
      title: 'Dead Letter Queue',
      value: metrics?.deadLetterJobs ?? 0,
      icon: AlertTriangle,
      color: 'text-rose-400',
      bgColor: 'bg-rose-500/10',
      borderColor: 'border-rose-500/20',
      sub: `${metrics?.failedJobs ?? 0} total attempt failures`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-sky-900/40 via-slate-900 to-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">System Health & Cluster Throughput</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time multi-tenant distributed job scheduler with atomic queue claiming.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onSelectTab('queues')}
            className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-slate-100 text-xs font-semibold shadow-lg shadow-sky-500/20 transition flex items-center gap-1.5"
          >
            <span>Manage Queues</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div
              key={i}
              className={`p-5 rounded-xl bg-slate-900 border ${c.borderColor} flex flex-col justify-between hover:border-slate-700 transition`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{c.title}</span>
                <div className={`p-2 rounded-lg ${c.bgColor} ${c.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-2xl font-bold text-slate-100 tracking-tight">{c.value}</div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-slate-400" />
                  <span>{c.sub}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Queues Status Preview */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-100">Active Queue Statuses</h2>
            <p className="text-xs text-slate-400">Concurrency limits and progress across project queues</p>
          </div>
          <button
            onClick={() => onSelectTab('queues')}
            className="text-xs text-sky-400 hover:text-sky-300 font-medium"
          >
            View all {queues.length} queues &rarr;
          </button>
        </div>

        {queues.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">
            No queues found in this project. Create a queue to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {queues.map((q) => {
              const stats = q.stats;
              const total = stats?.total_jobs || 0;
              const completed = stats?.completed_jobs || 0;
              const running = stats?.running_jobs || 0;
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

              return (
                <div
                  key={q.id}
                  className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-xs text-slate-200">{q.name}</div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        q.is_paused
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {q.is_paused ? 'Paused' : 'Active'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-[11px] py-1 border-y border-slate-800/60">
                    <div>
                      <div className="text-slate-400">Queued</div>
                      <div className="font-semibold text-slate-200">{stats?.queued_jobs ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Running</div>
                      <div className="font-semibold text-amber-400">{running}/{q.concurrency_limit}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Done</div>
                      <div className="font-semibold text-emerald-400">{completed}</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Completion</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
