import React, { useState, useEffect } from 'react';
import { Queue, UserRole, WebhookTrigger } from '../types/index.js';
import { api } from '../api/client.js';
import { Webhook, Plus, CheckCircle2, AlertCircle, Copy, Zap } from 'lucide-react';

interface WebhooksProps {
  projectId: string;
  queues: Queue[];
  role?: UserRole | null;
}

/**
 * EVENT-DRIVEN EXECUTION (bonus feature)
 * =======================================
 * Lets the user register a webhook trigger tied to a queue + job type,
 * then shows the signing secret and a ready-to-copy curl command so they
 * can fire it from an external system (CI pipeline, upstream service,
 * etc.) and see the job enqueue instantly — no poll wait.
 */
export const Webhooks: React.FC<WebhooksProps> = ({ projectId, queues, role }) => {
  const [triggers, setTriggers] = useState<WebhookTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [justCreated, setJustCreated] = useState<WebhookTrigger | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [name, setName] = useState('');
  const [queueId, setQueueId] = useState(queues[0]?.id || '');
  const [jobType, setJobType] = useState('WEBHOOK_TASK');
  const [submitting, setSubmitting] = useState(false);

  const canCreate = role === 'MEMBER' || role === 'ADMIN';

  const fetchTriggers = async () => {
    if (!projectId) return;
    try {
      const data = await api.listWebhooks(projectId);
      setTriggers(data);
    } catch (err) {
      console.error('Failed to list webhooks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTriggers();
  }, [projectId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queueId || !name.trim()) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const trigger = await api.createWebhook(projectId, { queueId, name: name.trim(), jobType });
      setJustCreated(trigger);
      setShowCreateModal(false);
      setName('');
      fetchTriggers();
      setMsg({ type: 'success', text: 'Webhook trigger created — copy the signing secret below now.' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const curlFor = (trigger: WebhookTrigger) => {
    const body = '{"event":"example"}';
    return `# Compute the signature (bash + openssl):\nSIG=$(echo -n '${body}' | openssl dgst -sha256 -hmac "${trigger.signing_secret}" | cut -d' ' -f2)\n\ncurl -X POST http://localhost:4000/api/v1/webhooks/${trigger.id}/fire \\\n  -H "Content-Type: application/json" \\\n  -H "X-Webhook-Signature: $SIG" \\\n  -d '${body}'`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">Event-Driven Webhooks</h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
              Bonus Feature
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            External systems POST here with an HMAC signature to enqueue a job instantly — bypassing the poll interval entirely.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={queues.length === 0}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-slate-100 text-xs font-semibold shadow-lg shadow-violet-500/20 transition flex items-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>New Webhook</span>
          </button>
        )}
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

      {!canCreate && (
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
          Your role ({role || 'VIEWER'}) can view webhooks but not create them. MEMBER role or higher is required.
        </div>
      )}

      {/* Just-created secret reveal */}
      {justCreated && (
        <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
          <div className="text-xs font-semibold text-amber-300">
            Save this signing secret now — it will not be shown again.
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-amber-300 font-mono text-[11px] overflow-x-auto">
              {justCreated.signing_secret}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(justCreated.signing_secret)}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Copy secret"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-sky-300 font-mono text-[10px] overflow-x-auto whitespace-pre-wrap">
            {curlFor(justCreated)}
          </pre>
          <button
            onClick={() => setJustCreated(null)}
            className="text-[11px] text-slate-400 hover:text-slate-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Triggers Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-4 py-3">Job Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Total Fired</th>
                <th className="px-4 py-3">Last Triggered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    Loading webhook triggers...
                  </td>
                </tr>
              ) : triggers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                    No webhook triggers registered yet.
                  </td>
                </tr>
              ) : (
                triggers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-5 py-3.5 font-medium text-slate-100 flex items-center gap-2">
                      <Webhook className="w-3.5 h-3.5 text-violet-400" />
                      {t.name}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-300">{t.job_type}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          t.is_active
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {t.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center font-mono font-semibold text-sky-400 flex items-center justify-center gap-1">
                      <Zap className="w-3 h-3" />
                      {t.total_triggers}
                    </td>
                    <td className="px-4 py-3.5 text-slate-400 text-[11px]">
                      {t.last_triggered_at ? new Date(t.last_triggered_at).toLocaleString() : 'Never fired'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <h2 className="text-sm font-bold text-slate-100">New Webhook Trigger</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Trigger Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. deploy-completed"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-violet-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Queue</label>
                <select
                  value={queueId}
                  onChange={(e) => setQueueId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-violet-500 focus:outline-none"
                >
                  {queues.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Job Type to Enqueue</label>
                <input
                  type="text"
                  required
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-violet-500 focus:outline-none"
                />
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
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-slate-100 text-xs font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Trigger'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
