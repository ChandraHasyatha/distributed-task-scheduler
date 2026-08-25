import React, { useState, useEffect } from 'react';
import { Job, JobExecution, JobLog, JobDependencyGraph } from '../types/index.js';
import { api } from '../api/client.js';
import {
  X,
  Clock,
  Terminal,
  Activity,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Cpu,
  Timer,
  GitBranch,
} from 'lucide-react';

interface JobDetailModalProps {
  jobId: string;
  onClose: () => void;
}

export const JobDetailModal: React.FC<JobDetailModalProps> = ({ jobId, onClose }) => {
  const [job, setJob] = useState<Job | null>(null);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [dependencies, setDependencies] = useState<JobDependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const j = await api.getJob(jobId);
        setJob(j);
        const execs = await api.getJobExecutions(jobId);
        setExecutions(execs);
        if (execs.length > 0) {
          setSelectedExecutionId(execs[execs.length - 1].id);
        }
        // WORKFLOW/DAG (bonus feature)
        api.getJobDependencies(jobId).then(setDependencies).catch(() => setDependencies(null));
      } catch (err) {
        console.error('Failed to load job details:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [jobId]);

  useEffect(() => {
    if (selectedExecutionId) {
      api.getExecutionLogs(selectedExecutionId).then(setLogs).catch(console.error);
    }
  }, [selectedExecutionId]);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-xl flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-100 text-sm">{job?.job_type || 'Job Details'}</span>
                <span className="font-mono text-[10px] text-slate-400">({jobId})</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Enqueued at {job ? new Date(job.created_at).toLocaleString() : ''}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading details...</div>
        ) : (
          <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
            {/* Top Grid Info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 text-[10px]">Status</div>
                <div className="font-bold text-slate-100 mt-0.5">{job?.status}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 text-[10px]">Attempts</div>
                <div className="font-bold text-slate-100 mt-0.5">
                  {job?.attempt_count} / {job?.max_attempts}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 text-[10px]">Priority</div>
                <div className="font-bold text-slate-100 mt-0.5">{job?.priority}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 text-[10px]">Timeout Limit</div>
                <div className="font-bold text-slate-100 mt-0.5">{job?.timeout_ms}ms</div>
              </div>
            </div>

            {/* Payload View */}
            <div className="space-y-2">
              <div className="font-semibold text-slate-200 text-xs">Job Payload (Input Arguments)</div>
              <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-sky-300 font-mono text-[11px] overflow-x-auto max-h-36">
                {JSON.stringify(typeof job?.payload === 'string' ? JSON.parse(job.payload) : job?.payload, null, 2)}
              </pre>
            </div>

            {/* WORKFLOW/DAG dependency graph (bonus feature) */}
            {dependencies && (dependencies.dependsOn.length > 0 || dependencies.dependents.length > 0) && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-semibold text-slate-200 text-xs">
                  <GitBranch className="w-3.5 h-3.5 text-violet-400" />
                  Workflow Dependencies
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">Bonus</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">
                      Depends On ({dependencies.dependsOn.length})
                    </div>
                    {dependencies.dependsOn.length === 0 ? (
                      <div className="text-slate-600 text-[11px] italic">No parent jobs</div>
                    ) : (
                      <div className="space-y-1.5">
                        {dependencies.dependsOn.map((parent) => (
                          <div key={parent.id} className="flex items-center justify-between text-[11px]">
                            <span className="font-mono text-slate-300">{parent.job_type}</span>
                            <span
                              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                                parent.status === 'COMPLETED'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-slate-700 text-slate-300'
                              }`}
                            >
                              {parent.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">
                      Blocks / Dependents ({dependencies.dependents.length})
                    </div>
                    {dependencies.dependents.length === 0 ? (
                      <div className="text-slate-600 text-[11px] italic">No dependent jobs</div>
                    ) : (
                      <div className="space-y-1.5">
                        {dependencies.dependents.map((child) => (
                          <div key={child.id} className="flex items-center justify-between text-[11px]">
                            <span className="font-mono text-slate-300">{child.job_type}</span>
                            <span
                              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                                child.status === 'WAITING'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-sky-500/20 text-sky-400'
                              }`}
                            >
                              {child.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Execution History & Tabs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200 text-xs">Execution Attempt History</span>
                <span className="text-[10px] text-slate-400">{executions.length} attempts recorded</span>
              </div>

              {executions.length === 0 ? (
                <div className="p-4 rounded-lg bg-slate-950 text-slate-500 text-center text-xs">
                  Job has not been executed by a worker yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Attempt selector */}
                  <div className="flex gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
                    {executions.map((exec) => (
                      <button
                        key={exec.id}
                        onClick={() => setSelectedExecutionId(exec.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                          selectedExecutionId === exec.id
                            ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span>Attempt #{exec.attempt_number}</span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            exec.status === 'COMPLETED'
                              ? 'bg-emerald-400'
                              : exec.status === 'RUNNING'
                              ? 'bg-amber-400'
                              : 'bg-rose-400'
                          }`}
                        />
                      </button>
                    ))}
                  </div>

                  {/* Worker assignment & timing for the selected attempt */}
                  {(() => {
                    const selected = executions.find((e) => e.id === selectedExecutionId);
                    if (!selected) return null;
                    return (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-2">
                          <Cpu className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          <div>
                            <div className="text-[9px] text-slate-500 uppercase tracking-wide">Worker</div>
                            <div className="font-mono text-[11px] text-slate-200">
                              {selected.worker_id ? `${selected.worker_id.slice(0, 8)}...` : 'Unassigned'}
                            </div>
                          </div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <div>
                            <div className="text-[9px] text-slate-500 uppercase tracking-wide">Started</div>
                            <div className="font-mono text-[11px] text-slate-200">
                              {new Date(selected.started_at).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-2">
                          <Timer className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <div>
                            <div className="text-[9px] text-slate-500 uppercase tracking-wide">Duration</div>
                            <div className="font-mono text-[11px] text-slate-200">
                              {selected.duration_ms != null ? `${selected.duration_ms}ms` : 'In progress...'}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Terminal Log Streamer */}
                  <div className="rounded-lg bg-slate-950 border border-slate-800 overflow-hidden">
                    <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5 text-sky-400" />
                        <span>Execution Logs</span>
                      </div>
                      <span>Attempt ID: {selectedExecutionId?.slice(0, 8)}</span>
                    </div>

                    <div className="p-3 font-mono text-[11px] space-y-1 max-h-48 overflow-y-auto">
                      {logs.length === 0 ? (
                        <div className="text-slate-500 italic">No logs captured for this execution attempt.</div>
                      ) : (
                        logs.map((log) => (
                          <div key={log.id} className="flex items-start gap-2">
                            <span className="text-slate-400 text-[10px]">
                              {new Date(log.logged_at).toLocaleTimeString()}
                            </span>
                            <span
                              className={`font-semibold text-[10px] ${
                                log.level === 'ERROR'
                                  ? 'text-rose-400'
                                  : log.level === 'WARN'
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                              }`}
                            >
                              [{log.level}]
                            </span>
                            <span className="text-slate-300">{log.message}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
