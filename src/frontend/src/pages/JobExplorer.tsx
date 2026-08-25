import React, { useState } from 'react';
import { Job, Queue, JobStatus } from '../types/index.js';
import { api } from '../api/client.js';
import {
  Search,
  Filter,
  Eye,
  XCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { JobDetailModal } from './JobDetailModal.js';

interface JobExplorerProps {
  queues: Queue[];
  onRefresh: () => void;
}

export const JobExplorer: React.FC<JobExplorerProps> = ({ queues, onRefresh }) => {
  const [selectedQueueId, setSelectedQueueId] = useState<string>(queues[0]?.id || '');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [inspectJobId, setInspectJobId] = useState<string | null>(null);

  const fetchJobs = async () => {
    if (!selectedQueueId) return;
    setLoading(true);
    try {
      const res = await api.listJobs(selectedQueueId, {
        status: selectedStatus || undefined,
        search: searchQuery || undefined,
        limit: 50,
      });
      setJobs(res);
    } catch (err) {
      console.error('Failed to list jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (selectedQueueId) {
      fetchJobs();
    }
  }, [selectedQueueId, selectedStatus]);

  const handleCancelJob = async (jobId: string) => {
    try {
      await api.cancelJob(jobId);
      fetchJobs();
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case 'WAITING':
        return <span className="bg-violet-500/20 text-violet-400 border border-violet-500/30 px-2 py-0.5 rounded text-[10px] font-semibold" title="Blocked on workflow/DAG dependencies (bonus feature)">WAITING</span>;
      case 'QUEUED':
        return <span className="bg-sky-500/20 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded text-[10px] font-semibold">QUEUED</span>;
      case 'SCHEDULED':
        return <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded text-[10px] font-semibold">SCHEDULED</span>;
      case 'CLAIMED':
        return <span className="bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded text-[10px] font-semibold">CLAIMED</span>;
      case 'RUNNING':
        return <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-semibold animate-pulse">RUNNING</span>;
      case 'COMPLETED':
        return <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-semibold">COMPLETED</span>;
      case 'FAILED':
        return <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] font-semibold">FAILED</span>;
      case 'DEAD_LETTER':
        return <span className="bg-rose-600/30 text-rose-300 border border-rose-600/40 px-2 py-0.5 rounded text-[10px] font-bold">DEAD LETTER</span>;
      case 'CANCELLED':
        return <span className="bg-slate-700/40 text-slate-400 border border-slate-700 px-2 py-0.5 rounded text-[10px] font-semibold">CANCELLED</span>;
      default:
        return <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px]">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Queue Selector */}
          <select
            value={selectedQueueId}
            onChange={(e) => setSelectedQueueId(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:border-sky-500 focus:outline-none"
          >
            {queues.map((q) => (
              <option key={q.id} value={q.id}>
                Queue: {q.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:border-sky-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="WAITING">WAITING (DAG blocked)</option>
            <option value="QUEUED">QUEUED</option>
            <option value="SCHEDULED">SCHEDULED</option>
            <option value="CLAIMED">CLAIMED</option>
            <option value="RUNNING">RUNNING</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="FAILED">FAILED</option>
            <option value="DEAD_LETTER">DEAD LETTER</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        {/* Search input */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search job type / payload..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchJobs()}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:border-sky-500 focus:outline-none"
            />
          </div>
          <button
            onClick={fetchJobs}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
          >
            Search
          </button>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3">Job ID</th>
                <th className="px-4 py-3">Job Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Attempts</th>
                <th className="px-4 py-3 text-center">Priority</th>
                <th className="px-4 py-3">Run At / Scheduled</th>
                <th className="px-4 py-3">Enqueued At</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    Loading jobs...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                    No jobs found matching your query in this queue.
                  </td>
                </tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-5 py-3 font-mono text-[11px] text-slate-400">
                      {j.id.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-100">{j.job_type}</td>
                    <td className="px-4 py-3">{getStatusBadge(j.status)}</td>
                    <td className="px-4 py-3 text-center font-mono font-medium text-slate-300">
                      {j.attempt_count}/{j.max_attempts}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-slate-200">{j.priority}</td>
                    <td className="px-4 py-3 text-[11px] text-slate-400">
                      {new Date(j.run_at).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-400">
                      {new Date(j.created_at).toLocaleTimeString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setInspectJobId(j.id)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 font-medium transition flex items-center gap-1"
                          title="Inspect Details & Logs"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>
                        {(j.status === 'QUEUED' || j.status === 'SCHEDULED') && (
                          <button
                            onClick={() => handleCancelJob(j.id)}
                            className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                            title="Cancel Job"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect Modal */}
      {inspectJobId && (
        <JobDetailModal jobId={inspectJobId} onClose={() => setInspectJobId(null)} />
      )}
    </div>
  );
};
