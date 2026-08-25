import React from 'react';
import {
  LayoutDashboard,
  Layers,
  Search,
  Calendar,
  AlertOctagon,
  Cpu,
  Webhook,
  Lock,
} from 'lucide-react';
import { UserRole } from '../types/index.js';

export type NavTab = 'overview' | 'queues' | 'jobs' | 'scheduled' | 'dlq' | 'workers' | 'webhooks' | 'locks';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  dlqCount?: number;
  activeWorkersCount?: number;
  role?: UserRole | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  dlqCount = 0,
  activeWorkersCount = 0,
  role,
}) => {
  const navItems = [
    { id: 'overview' as NavTab, label: 'Overview', icon: LayoutDashboard },
    { id: 'queues' as NavTab, label: 'Queues & Limits', icon: Layers },
    { id: 'jobs' as NavTab, label: 'Job Explorer', icon: Search },
    { id: 'scheduled' as NavTab, label: 'Recurring Cron', icon: Calendar },
    {
      id: 'dlq' as NavTab,
      label: 'Dead Letter Queue',
      icon: AlertOctagon,
      badge: dlqCount > 0 ? dlqCount : null,
      badgeColor: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
    },
    {
      id: 'workers' as NavTab,
      label: 'Worker Nodes',
      icon: Cpu,
      badge: activeWorkersCount > 0 ? `${activeWorkersCount} Online` : null,
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    },
    {
      id: 'webhooks' as NavTab,
      label: 'Webhooks',
      icon: Webhook,
      badge: 'Bonus',
      badgeColor: 'bg-violet-500/20 text-violet-400 border border-violet-500/30',
    },
    // DISTRIBUTED LOCKING (bonus feature) — observability is ADMIN-only,
    // matching the backend's requireRole('ADMIN') guard on GET /locks.
    ...(role === 'ADMIN'
      ? [
          {
            id: 'locks' as NavTab,
            label: 'Distributed Locks',
            icon: Lock,
            badge: 'Admin',
            badgeColor: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
          },
        ]
      : []),
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/40 p-4 flex flex-col justify-between shrink-0">
      <div className="space-y-1">
        <div className="px-3 py-2 text-[10px] uppercase font-semibold tracking-wider text-slate-400">
          Management
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                isActive
                  ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* System Engine Tag */}
      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] space-y-1">
        <div className="text-slate-400 font-medium">Engine Details</div>
        <div className="flex justify-between text-slate-300">
          <span>Locking:</span>
          <span className="font-mono text-sky-400">SKIP LOCKED</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span>Concurrency:</span>
          <span className="font-mono text-emerald-400">Queue Mutex</span>
        </div>
      </div>
    </aside>
  );
};
