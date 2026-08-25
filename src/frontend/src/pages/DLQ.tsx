import React, { useState, useEffect } from 'react';
import { DeadLetterEntry, UserRole } from '../types/index.js';
import { api } from '../api/client.js';
import { AlertOctagon, RotateCcw, Trash2, CheckCircle2, AlertCircle, Sparkles, Loader2 } from 'lucide-react';

interface DLQProps {
  role?: UserRole | null;
}

export const DLQ: React.FC<DLQProps> = ({ role }) => {
  const canReplay = role === 'MEMBER' || role === 'ADMIN';
  const canPurge = role === 'ADMIN';

  const [entries, setEntries] = useState<DeadLetterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchDLQ = async () => {
    try {
      const data = await api.listDlq();
      setEntries(data);
    } catch (err) {
      console.error('Failed to list DLQ entries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDLQ();
  }, []);

  const handleReplay = async (id: string) => {
    setMsg(null);
    try {
      await api.replayDlq(id);
      fetchDLQ();
      setMsg({ type: 'success', text: 'Job successfully re-queued from DLQ!' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handlePurge = async (id: string) => {
    if (!confirm('Are you sure you want to permanently purge this DLQ entry?')) return;
    try {
      await api.purgeDlq(id);
      fetchDLQ();
      setMsg({ type: 'success', text: 'DLQ entry purged' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  // AI-GENERATED FAILURE SUMMARIES (bonus feature): regenerate on demand.
  const handleSummarize = async (id: string) => {
    setSummarizingId(id);
    try {
      await api.summarizeDlqEntry(id);
      await fetchDLQ();
      setExpandedId(id);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSummarizingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">Dead Letter Queue (DLQ)</h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Inspection and manual replay of jobs that exhausted all configured retry attempts. Each entry gets an{' '}
          <span className="text-violet-400 font-medium">AI-generated failure summary</span> (bonus feature).
        </p>
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

      {/* DLQ Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3">Job ID</th>
                <th className="px-4 py-3">Job Type</th>
                <th className="px-4 py-3">Failure Reason</th>
                <th className="px-4 py-3 text-center">Attempts Made</th>
                <th className="px-4 py-3">Entered DLQ</th>
                <th className="px-4 py-3">Replay Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    Loading dead letter queue...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    Dead letter queue is currently empty. No exhausted job failures!
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <React.Fragment key={e.id}>
                    <tr className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3.5 font-mono text-[11px] text-slate-400">{e.job_id.slice(0, 8)}...</td>
                      <td className="px-4 py-3.5 font-semibold text-slate-100">{e.job_type}</td>
                      <td className="px-4 py-3.5 max-w-xs text-rose-300 font-mono text-[11px] truncate">
                        {e.failed_reason}
                      </td>
                      <td className="px-4 py-3.5 text-center font-mono text-slate-200">{e.total_attempts}</td>
                      <td className="px-4 py-3.5 text-slate-400 text-[11px]">
                        {new Date(e.entered_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5 text-[11px]">
                        {e.replayed_at ? (
                          <span className="text-emerald-400 font-medium">Replayed ({new Date(e.replayed_at).toLocaleTimeString()})</span>
                        ) : (
                          <span className="text-amber-400 font-medium">Pending Review</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                            className={`px-2.5 py-1 rounded font-medium transition flex items-center gap-1 ${
                              e.ai_summary
                                ? 'bg-violet-500/10 hover:bg-violet-500/20 text-violet-400'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                            }`}
                            title="AI-generated failure summary (bonus feature)"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>{e.ai_summary ? 'Summary' : 'No summary'}</span>
                          </button>
                          <button
                            onClick={() => handleReplay(e.id)}
                            disabled={!canReplay}
                            title={canReplay ? 'Replay Job Back to QUEUED' : 'MEMBER role or higher required'}
                            className="px-2.5 py-1 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 font-medium transition flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Replay</span>
                          </button>
                          <button
                            onClick={() => handlePurge(e.id)}
                            disabled={!canPurge}
                            title={canPurge ? 'Purge DLQ Record' : 'ADMIN role required'}
                            className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === e.id && (
                      <tr className="bg-violet-500/5">
                        <td colSpan={7} className="px-5 py-4">
                          <div className="flex items-start gap-3">
                            <Sparkles className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                            <div className="flex-1 space-y-2">
                              {e.ai_summary ? (
                                <>
                                  <p className="text-slate-200 text-[12px] leading-relaxed">{e.ai_summary}</p>
                                  {e.ai_summary_generated_at && (
                                    <p className="text-[10px] text-slate-500">
                                      Generated {new Date(e.ai_summary_generated_at).toLocaleString()}
                                    </p>
                                  )}
                                </>
                              ) : (
                                <p className="text-slate-500 text-[12px] italic">
                                  No AI summary generated yet for this failure.
                                </p>
                              )}
                              <button
                                onClick={() => handleSummarize(e.id)}
                                disabled={summarizingId === e.id}
                                className="text-[11px] font-medium text-violet-400 hover:text-violet-300 flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {summarizingId === e.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3 h-3" />
                                )}
                                <span>{e.ai_summary ? 'Regenerate summary' : 'Generate summary'}</span>
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
