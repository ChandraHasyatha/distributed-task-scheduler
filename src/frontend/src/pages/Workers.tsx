import React, { useState, useEffect } from 'react';
import { Worker } from '../types/index.js';
import { api } from '../api/client.js';
import { Cpu, Activity, Clock, CheckCircle2, AlertTriangle, XCircle, Server } from 'lucide-react';

export const Workers: React.FC = () => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWorkers = async () => {
    try {
      const data = await api.listWorkers();
      setWorkers(data);
    } catch (err) {
      console.error('Failed to load workers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
    const interval = setInterval(fetchWorkers, 3000);
    return () => clearInterval(interval);
  }, []);

  const getHeartbeatFreshness = (lastHeartbeat: string) => {
    const elapsedSec = Math.round((Date.now() - new Date(lastHeartbeat).getTime()) / 1000);
    if (elapsedSec < 10) {
      return { label: `Healthy (${elapsedSec}s ago)`, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
    }
    if (elapsedSec < 30) {
      return { label: `Stale (${elapsedSec}s ago)`, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
    }
    return { label: `Dead / Offline (${elapsedSec}s ago)`, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100 tracking-tight">Worker Cluster & Heartbeat Monitor</h1>
        <p className="text-xs text-slate-400 mt-1">
          Real-time daemon registration, concurrency limits, and live heartbeat telemetry.
        </p>
      </div>

      {/* Workers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-xs text-slate-400">Loading worker cluster...</div>
        ) : workers.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-xl">
            No active worker daemons detected. Run <code className="text-sky-400 font-mono">npm run dev:worker</code> to start one.
          </div>
        ) : (
          workers.map((w) => {
            const health = getHeartbeatFreshness(w.last_heartbeat_at);
            return (
              <div
                key={w.id}
                className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition space-y-4 shadow-sm"
              >
                {/* Top Info */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-slate-100">{w.hostname}</div>
                      <div className="text-[10px] font-mono text-slate-400">PID: {w.pid}</div>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      w.status === 'ONLINE'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : w.status === 'DRAINING'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}
                  >
                    {w.status}
                  </span>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 text-[11px] p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60">
                  <div>
                    <div className="text-slate-400">Active Tasks</div>
                    <div className="font-semibold text-amber-400 font-mono mt-0.5">
                      {w.active_jobs_count} / {w.concurrency_limit}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Boot Time</div>
                    <div className="font-semibold text-slate-300 font-mono mt-0.5">
                      {new Date(w.started_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                {/* Heartbeat Status */}
                <div className={`p-2 rounded-lg border text-[11px] flex items-center justify-between ${health.bg}`}>
                  <div className="flex items-center gap-1.5">
                    <Activity className={`w-3.5 h-3.5 ${health.color}`} />
                    <span className="text-slate-400">Heartbeat:</span>
                  </div>
                  <span className={`font-semibold ${health.color}`}>{health.label}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
