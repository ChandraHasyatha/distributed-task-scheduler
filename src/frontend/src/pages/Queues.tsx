import React, { useState, useEffect } from 'react';
import { Queue, UserRole, Job } from '../types/index.js';
import { api } from '../api/client.js';
import {
  Plus,
  Play,
  Pause,
  Sliders,
  Send,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Shuffle,
  GitBranch,
} from 'lucide-react';

interface QueuesProps {
  projectId: string;
  queues: Queue[];
  onRefresh: () => void;
  role?: UserRole | null;
}

export const Queues: React.FC<QueuesProps> = ({ projectId, queues, onRefresh, role }) => {
  const canManage = role === 'MEMBER' || role === 'ADMIN';
  const canAdmin = role === 'ADMIN';

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJobModal, setShowJobModal] = useState<Queue | null>(null);
  const [showEditModal, setShowEditModal] = useState<Queue | null>(null);

  // Form states
  const [newQueueName, setNewQueueName] = useState('');
  const [newQueuePriority, setNewQueuePriority] = useState(10);
  const [newQueueLimit, setNewQueueLimit] = useState(5);
  // QUEUE SHARDING (bonus feature): partitions this queue's claimable jobs
  // across N worker shards. 1 = sharding disabled (default behavior).
  const [newQueueShardCount, setNewQueueShardCount] = useState(1);

  // Quick Job Enqueue Form
  const [jobType, setJobType] = useState('SEND_EMAIL');
  const [jobPayload, setJobPayload] = useState('{\n  "recipient": "user@example.com",\n  "subject": "System Alert"\n}');
  const [jobPriority, setJobPriority] = useState(10);
  const [jobDelaySec, setJobDelaySec] = useState(0);
  // WORKFLOW/DAG (bonus feature): jobs this new job should wait on.
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [candidateJobs, setCandidateJobs] = useState<Job[]>([]);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQueueName.trim()) return;
    setLoading(true);
    setMsg(null);
    try {
      await api.createQueue(projectId, {
        name: newQueueName.trim(),
        priority: Number(newQueuePriority),
        concurrencyLimit: Number(newQueueLimit),
        shardCount: Number(newQueueShardCount),
      });
      setShowCreateModal(false);
      setNewQueueName('');
      onRefresh();
      setMsg({ type: 'success', text: 'Queue created successfully' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePause = async (queue: Queue) => {
    try {
      if (queue.is_paused) {
        await api.resumeQueue(queue.id);
      } else {
        await api.pauseQueue(queue.id);
      }
      onRefresh();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleUpdateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal) return;
    setLoading(true);
    try {
      await api.updateQueue(showEditModal.id, {
        priority: Number(showEditModal.priority),
        concurrencyLimit: Number(showEditModal.concurrency_limit),
      });
      setShowEditModal(null);
      onRefresh();
      setMsg({ type: 'success', text: 'Queue updated successfully' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleEnqueueJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showJobModal) return;
    setLoading(true);
    setMsg(null);
    try {
      let parsed = {};
      if (jobPayload.trim()) {
        parsed = JSON.parse(jobPayload);
      }
      await api.enqueueJob(showJobModal.id, {
        jobType,
        payload: parsed,
        priority: Number(jobPriority),
        delayMs: Number(jobDelaySec) * 1000,
        dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
      });
      setShowJobModal(null);
      setDependsOn([]);
      onRefresh();
      setMsg({ type: 'success', text: `Job enqueued into '${showJobModal.name}' successfully` });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // WORKFLOW/DAG (bonus feature): when the enqueue modal opens, load a
  // short list of recent non-terminal jobs in this queue as candidate
  // dependencies to pick from.
  useEffect(() => {
    if (!showJobModal) {
      setCandidateJobs([]);
      setDependsOn([]);
      return;
    }
    api
      .listJobs(showJobModal.id, { limit: 20 })
      .then((jobs) => setCandidateJobs(jobs.filter((j) => j.status !== 'CANCELLED')))
      .catch(() => setCandidateJobs([]));
  }, [showJobModal]);

  const toggleDependency = (jobId: string) => {
    setDependsOn((prev) => (prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">Queue Management & Configuration</h1>
          <p className="text-xs text-slate-400 mt-1">
            Configure queue priorities, concurrency boundaries, and pause/resume execution pipelines.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          disabled={!canManage}
          title={!canManage ? 'MEMBER role or higher required' : undefined}
          className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-slate-100 text-xs font-semibold shadow-lg shadow-sky-500/20 transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          <span>New Queue</span>
        </button>
      </div>

      {msg && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            msg.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Queues Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3">Queue Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Priority</th>
                <th className="px-4 py-3 text-center">Concurrency Cap</th>
                <th className="px-4 py-3 text-center" title="Queue sharding (bonus feature)">
                  <span className="inline-flex items-center gap-1">
                    <Shuffle className="w-3 h-3 text-violet-400" /> Shards
                  </span>
                </th>
                <th className="px-4 py-3 text-center">Queued</th>
                <th className="px-4 py-3 text-center">Active In-Flight</th>
                <th className="px-4 py-3 text-center">Completed</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {queues.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-slate-500">
                    No queues configured for this project yet.
                  </td>
                </tr>
              ) : (
                queues.map((q) => {
                  const stats = q.stats;
                  return (
                    <tr key={q.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3.5 font-medium text-slate-100">{q.name}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            q.is_paused
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {q.is_paused ? 'PAUSED' : 'ACTIVE'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center font-mono font-semibold text-slate-200">
                        {q.priority}
                      </td>
                      <td className="px-4 py-3.5 text-center font-mono font-semibold text-sky-400">
                        {q.concurrency_limit}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {q.shard_count > 1 ? (
                          <span className="font-mono font-semibold text-violet-400">{q.shard_count}×</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center font-semibold text-slate-300">
                        {stats?.queued_jobs ?? 0}
                      </td>
                      <td className="px-4 py-3.5 text-center font-semibold text-amber-400">
                        {stats?.running_jobs ?? 0}
                      </td>
                      <td className="px-4 py-3.5 text-center font-semibold text-emerald-400">
                        {stats?.completed_jobs ?? 0}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setShowJobModal(q)}
                            className="px-2.5 py-1 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 font-medium transition flex items-center gap-1"
                            title="Enqueue Job"
                          >
                            <Send className="w-3 h-3" />
                            <span>Enqueue</span>
                          </button>
                          <button
                            onClick={() => handleTogglePause(q)}
                            disabled={!canAdmin}
                            title={canAdmin ? (q.is_paused ? 'Resume Queue' : 'Pause Queue') : 'ADMIN role required'}
                            className={`p-1.5 rounded transition disabled:opacity-30 disabled:cursor-not-allowed ${
                              q.is_paused
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400'
                            }`}
                          >
                            {q.is_paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => setShowEditModal(q)}
                            disabled={!canManage}
                            title={canManage ? 'Configure Limits' : 'MEMBER role or higher required'}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Queue Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <h2 className="text-sm font-bold text-slate-100">Create New Queue</h2>
            <form onSubmit={handleCreateQueue} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Queue Identifier Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. notifications, video-encoding"
                  value={newQueueName}
                  onChange={(e) => setNewQueueName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Priority (Higher = 1st)</label>
                  <input
                    type="number"
                    min="1"
                    value={newQueuePriority}
                    onChange={(e) => setNewQueuePriority(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Concurrency Limit</label>
                  <input
                    type="number"
                    min="1"
                    value={newQueueLimit}
                    onChange={(e) => setNewQueueLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                  <Shuffle className="w-3 h-3 text-violet-400" />
                  Shard Count
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">Bonus</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="64"
                  value={newQueueShardCount}
                  onChange={(e) => setNewQueueShardCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-violet-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  1 = sharding disabled. &gt;1 partitions claimable jobs by hash across worker shards for horizontal scale.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-slate-100 text-xs font-semibold disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Queue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Queue Limits Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <h2 className="text-sm font-bold text-slate-100">Configure Limits: {showEditModal.name}</h2>
            <form onSubmit={handleUpdateQueue} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Priority</label>
                  <input
                    type="number"
                    min="1"
                    value={showEditModal.priority}
                    onChange={(e) => setShowEditModal({ ...showEditModal, priority: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Concurrency Limit</label>
                  <input
                    type="number"
                    min="1"
                    value={showEditModal.concurrency_limit}
                    onChange={(e) => setShowEditModal({ ...showEditModal, concurrency_limit: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-slate-100 text-xs font-semibold disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enqueue Job Modal */}
      {showJobModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <h2 className="text-sm font-bold text-slate-100">Enqueue Job &rarr; {showJobModal.name}</h2>
            <form onSubmit={handleEnqueueJob} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Job Type / Handler</label>
                  <select
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-sky-500 focus:outline-none"
                  >
                    <option value="SIMULATE_SUCCESS">SIMULATE_SUCCESS</option>
                    <option value="SEND_EMAIL">SEND_EMAIL</option>
                    <option value="PROCESS_IMAGE">PROCESS_IMAGE</option>
                    <option value="GENERATE_REPORT">GENERATE_REPORT</option>
                    <option value="FAIL_THEN_SUCCEED">FAIL_THEN_SUCCEED (Retries)</option>
                    <option value="SIMULATE_FAILURE">SIMULATE_FAILURE (DLQ)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Delay (Seconds)</label>
                  <input
                    type="number"
                    min="0"
                    value={jobDelaySec}
                    onChange={(e) => setJobDelaySec(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-sky-500 focus:outline-none"
                    placeholder="0 for immediate"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">JSON Payload</label>
                <textarea
                  rows={4}
                  value={jobPayload}
                  onChange={(e) => setJobPayload(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              {/* WORKFLOW/DAG dependency picker (bonus feature) */}
              {candidateJobs.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                    <GitBranch className="w-3 h-3 text-violet-400" />
                    Depends On (optional)
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">Bonus</span>
                  </label>
                  <div className="max-h-28 overflow-y-auto rounded-lg bg-slate-950 border border-slate-800 divide-y divide-slate-800/60">
                    {candidateJobs.map((cj) => (
                      <label
                        key={cj.id}
                        className="flex items-center justify-between px-3 py-1.5 text-[11px] cursor-pointer hover:bg-slate-900"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={dependsOn.includes(cj.id)}
                            onChange={() => toggleDependency(cj.id)}
                            className="accent-violet-500"
                          />
                          <span className="font-mono text-slate-300">{cj.job_type}</span>
                        </span>
                        <span className="text-slate-500">{cj.status}</span>
                      </label>
                    ))}
                  </div>
                  {dependsOn.length > 0 && (
                    <p className="text-[10px] text-violet-400 mt-1">
                      This job will start WAITING and only become claimable once {dependsOn.length} selected job(s) COMPLETE.
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowJobModal(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-slate-100 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{loading ? 'Submitting...' : 'Enqueue Job'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
