import React, { useState, useEffect } from 'react';
import { DistributedLock } from '../types/index.js';
import { api } from '../api/client.js';
import { Lock, LockOpen, RefreshCw } from 'lucide-react';

/**
 * DISTRIBUTED LOCKING (bonus feature) — observability screen.
 * Actual mutual exclusion happens server-side via Postgres advisory
 * locks (see core/services/lock.service.ts); this page just lets an
 * ADMIN see which lock keys are currently held and by whom — e.g.
 * "reaper:sweep" held by whichever scheduler instance won leader
 * election for this tick.
 */
export const Locks: React.FC = () => {
  const [locks, setLocks] = useState<DistributedLock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLocks = async () => {
    try {
      const data = await api.listLocks();
      setLocks(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocks();
    const interval = setInterval(fetchLocks, 5000);
    return () => clearInterval(interval);
  }, []);

  const activeLocks = locks.filter((l) => !l.released_at);
  const releasedLocks = locks.filter((l) => l.released_at);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">Distributed Locks</h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Bonus Feature · Admin Only
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Cluster-wide mutual exclusion via Postgres advisory locks (<code className="text-sky-400">pg_try_advisory_lock</code>) — used to leader-elect the reaper sweep across scheduler instances.
          </p>
        </div>
        <button
          onClick={fetchLocks}
          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700 transition"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Active Locks */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          Currently Held ({activeLocks.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3">Lock Key</th>
                <th className="px-4 py-3">Holder</th>
                <th className="px-4 py-3">Acquired At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-400">
                    Loading locks...
                  </td>
                </tr>
              ) : activeLocks.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-500">
                    No locks currently held — nothing is mid-critical-section right now.
                  </td>
                </tr>
              ) : (
                activeLocks.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-5 py-3.5 font-mono text-amber-300">{l.lock_key}</td>
                    <td className="px-4 py-3.5 font-mono text-slate-200">{l.holder}</td>
                    <td className="px-4 py-3.5 text-slate-400 text-[11px]">
                      {new Date(l.acquired_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recently Released */}
      {releasedLocks.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2 text-xs font-semibold text-slate-200">
            <LockOpen className="w-3.5 h-3.5 text-emerald-400" />
            Recently Released ({releasedLocks.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3">Lock Key</th>
                  <th className="px-4 py-3">Holder</th>
                  <th className="px-4 py-3">Acquired</th>
                  <th className="px-4 py-3">Released</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {releasedLocks.slice(0, 20).map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-5 py-3.5 font-mono text-slate-400">{l.lock_key}</td>
                    <td className="px-4 py-3.5 font-mono text-slate-400">{l.holder}</td>
                    <td className="px-4 py-3.5 text-slate-500 text-[11px]">
                      {new Date(l.acquired_at).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 text-[11px]">
                      {l.released_at ? new Date(l.released_at).toLocaleTimeString() : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
