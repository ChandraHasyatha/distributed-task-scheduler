import React from 'react';
import { Project, User, UserRole } from '../types/index.js';
import { Layers, Activity, LogOut, ChevronDown, UserCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react';

interface NavbarProps {
  user: User | null;
  role?: UserRole | null;
  liveConnected?: boolean;
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (project: Project) => void;
  onLogout: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  role,
  liveConnected,
  projects,
  activeProject,
  onSelectProject,
  onLogout,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Brand & Project Selector */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 font-bold">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="font-semibold text-slate-100 tracking-tight text-sm">Distributed Job Scheduler</span>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Cluster Active (Postgres 16)</span>
            </div>
          </div>
        </div>

        {/* Project Switcher */}
        {projects.length > 0 && (
          <div className="relative group">
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-800 text-xs font-medium text-slate-300 border border-slate-700 transition">
              <span className="text-slate-400">Project:</span>
              <span className="text-slate-100 font-semibold">{activeProject?.name || 'Select Project'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
            <div className="absolute left-0 top-full mt-1.5 w-56 bg-slate-900 border border-slate-800 rounded-lg shadow-xl py-1 hidden group-hover:block z-50">
              <div className="px-3 py-1.5 text-[10px] uppercase font-semibold tracking-wider text-slate-400 border-b border-slate-800">
                Switch Project
              </div>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelectProject(p)}
                  className={`w-full text-left px-3 py-2 text-xs transition flex items-center justify-between ${
                    activeProject?.id === p.id
                      ? 'bg-sky-500/10 text-sky-400 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <span>{p.name}</span>
                  {activeProject?.id === p.id && <span className="text-[10px] bg-sky-500/20 px-1.5 py-0.5 rounded">Active</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        {/* WebSocket live-update status (bonus feature) */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
            liveConnected
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
          }`}
          title={liveConnected ? 'WebSocket connected — live updates active' : 'Reconnecting to live feed...'}
        >
          {liveConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span>{liveConnected ? 'Live' : 'Reconnecting'}</span>
        </div>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-slate-100 border border-slate-700 transition disabled:opacity-50"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
        </button>

        {user && (
          <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <UserCircle className="w-5 h-5" />
              </div>
              <div className="text-left hidden sm:block">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-200">{user.fullName}</span>
                  {role && (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        role === 'ADMIN'
                          ? 'bg-rose-500/20 text-rose-400'
                          : role === 'MEMBER'
                          ? 'bg-sky-500/20 text-sky-400'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                      title="Role-based access control (bonus feature)"
                    >
                      {role}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">{user.email}</div>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
