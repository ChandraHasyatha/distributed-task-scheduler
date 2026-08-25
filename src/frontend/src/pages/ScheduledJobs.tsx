import React, { useState, useEffect } from 'react';
import { ScheduledJob, Queue } from '../types/index.js';
import { api } from '../api/client.js';
import { Plus, Calendar, Clock, Play, Pause, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

interface ScheduledJobsProps {
  projectId: string;
  queues: Queue[];
  onRefresh: () => void;
}

export const ScheduledJobs: React.FC<ScheduledJobsProps> = ({ projectId, queues }) => {
  const [schedules, setSchedules] = useState<ScheduledJob[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [queueId, setQueueId] = useState(queues[0]?.id || '');
  const [cronExpression, setCronExpression] = useState('*/5 * * * *');
  const [jobType, setJobType] = useState('DATABASE_CLEANUP');
  const [payload, setPayload] = useState('{\n  "mode": "compact"\n}');

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSchedules = async () => {
    try {
      const data = await api.listScheduledJobs(projectId);
      setSchedules(data);
    } catch (err) {
      console.error('Failed to list schedules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, [projectId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      let parsed = {};
      if (payload.trim()) parsed = JSON.parse(payload);

      await api.createScheduledJob(projectId, {
        queueId,
        name,
        cronExpression,
        jobType,
        payload: parsed,
      });
      setShowModal(false);
      setName('');
      fetchSchedules();
      setMsg({ type: 'success', text: 'Recurring cron schedule created successfully' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleToggle = async (id: string, current: boolean) => {
    try {
      await api.toggleScheduledJob(id, !current);
      fetchSchedules();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    try {
      await api.deleteScheduledJob(id);
      fetchSchedules();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">Recurring Cron Schedules</h1>
          <p className="text-xs text-slate-400 mt-1">
            Automated recurring job dispatch engine using standard 5-field cron syntax.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-slate-100 text-xs font-semibold shadow-lg shadow-sky-500/20 transition flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>New Cron Schedule</span>
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

      {/* Schedules Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3">Schedule Name</th>
                <th className="px-4 py-3">Job Type</th>
                <th className="px-4 py-3">Cron Pattern</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Next Trigger</th>
                <th className="px-4 py-3">Last Trigger</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    Loading cron definitions...
                  </td>
                </tr>
              ) : schedules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    No recurring schedules created yet.
                  </td>
                </tr>
              ) : (
                schedules.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-5 py-3.5 font-medium text-slate-100">{s.name}</td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-sky-400">{s.job_type}</td>
                    <td className="px-4 py-3.5 font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded inline-block my-2">
                      {s.cron_expression}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          s.is_active
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {s.is_active ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-300 text-[11px]">
                      {new Date(s.next_run_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-slate-400 text-[11px]">
                      {s.last_run_at ? new Date(s.last_run_at).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggle(s.id, s.is_active)}
                          className={`p-1.5 rounded transition ${
                            s.is_active
                              ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400'
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                          }`}
                          title={s.is_active ? 'Pause Cron' : 'Resume Cron'}
                        >
                          {s.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <h2 className="text-sm font-bold text-slate-100">Create Recurring Cron Schedule</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Schedule Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Daily Report Generator"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Queue</label>
                <select
                  value={queueId}
                  onChange={(e) => setQueueId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-sky-500 focus:outline-none"
                >
                  {queues.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Cron Expression (5 fields)</label>
                  <input
                    type="text"
                    required
                    placeholder="*/5 * * * *"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Job Type</label>
                  <input
                    type="text"
                    required
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">JSON Payload</label>
                <textarea
                  rows={3}
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-slate-100 text-xs font-semibold"
                >
                  Create Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
