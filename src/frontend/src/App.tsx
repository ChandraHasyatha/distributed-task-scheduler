import React, { useState, useEffect, useCallback } from 'react';
import { User, Project, Queue, SystemMetrics, UserRole, RealtimeEvent } from './types/index.js';
import { api } from './api/client.js';
import { useLiveEvents } from './hooks/useLiveEvents.js';
import { Navbar } from './components/Navbar.js';
import { Sidebar, NavTab } from './components/Sidebar.js';
import { Overview } from './pages/Overview.js';
import { Queues } from './pages/Queues.js';
import { JobExplorer } from './pages/JobExplorer.js';
import { ScheduledJobs } from './pages/ScheduledJobs.js';
import { DLQ } from './pages/DLQ.js';
import { Workers } from './pages/Workers.js';
import { Webhooks } from './pages/Webhooks.js';
import { Locks } from './pages/Locks.js';
import { Auth } from './pages/Auth.js';

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!api.getToken());
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(api.getRole());
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadUserData = async () => {
    try {
      const me = await api.getMe();
      setUser(me.user);
      setRole(api.getRole());

      const projList = await api.listProjects();
      setProjects(projList);
      if (projList.length > 0 && !activeProject) {
        setActiveProject(projList[0]);
      }
    } catch (err) {
      console.error('Failed to load user info:', err);
      api.logout();
      setIsAuthenticated(false);
    }
  };

  const loadProjectData = useCallback(async () => {
    if (!activeProject) return;
    setIsRefreshing(true);
    try {
      const [qList, mData] = await Promise.all([
        api.listQueues(activeProject.id),
        api.getSystemMetrics(),
      ]);
      setQueues(qList);
      setMetrics(mData);
    } catch (err) {
      console.error('Failed to load project data:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [activeProject]);

  useEffect(() => {
    if (isAuthenticated) {
      loadUserData();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (activeProject) {
      loadProjectData();
      // WEBSOCKET LIVE UPDATES (bonus feature) mean this polling interval
      // is now just a safety-net fallback, not the primary refresh path —
      // see useLiveEvents below for instant push-based refresh.
      const interval = setInterval(loadProjectData, 15000);
      return () => clearInterval(interval);
    }
  }, [activeProject, loadProjectData]);

  // WEBSOCKET LIVE UPDATES (bonus feature): any job/queue/worker/DLQ
  // mutation anywhere in the system triggers an instant refresh here,
  // instead of waiting for the next poll tick.
  const handleLiveEvent = useCallback(
    (_event: RealtimeEvent) => {
      if (isAuthenticated && activeProject) {
        loadProjectData();
      }
    },
    [isAuthenticated, activeProject, loadProjectData]
  );
  const { connected: liveConnected } = useLiveEvents(handleLiveEvent);

  if (!isAuthenticated) {
    return <Auth onAuthSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Navbar Header */}
      <Navbar
        user={user}
        role={role}
        liveConnected={liveConnected}
        projects={projects}
        activeProject={activeProject}
        onSelectProject={(p) => setActiveProject(p)}
        onLogout={() => {
          api.logout();
          setIsAuthenticated(false);
        }}
        onRefresh={loadProjectData}
        isRefreshing={isRefreshing}
      />

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          dlqCount={metrics?.deadLetterJobs}
          activeWorkersCount={metrics?.activeWorkers}
          role={role}
        />

        {/* Content Area */}
        <main className="flex-1 p-6 overflow-y-auto max-w-7xl mx-auto w-full">
          {activeTab === 'overview' && (
            <Overview
              metrics={metrics}
              queues={queues}
              onSelectTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'queues' && (
            <Queues
              projectId={activeProject?.id || ''}
              queues={queues}
              onRefresh={loadProjectData}
              role={role}
            />
          )}

          {activeTab === 'jobs' && (
            <JobExplorer
              queues={queues}
              onRefresh={loadProjectData}
            />
          )}

          {activeTab === 'scheduled' && (
            <ScheduledJobs
              projectId={activeProject?.id || ''}
              queues={queues}
              onRefresh={loadProjectData}
            />
          )}

          {activeTab === 'dlq' && <DLQ role={role} />}

          {activeTab === 'workers' && <Workers />}

          {activeTab === 'webhooks' && (
            <Webhooks projectId={activeProject?.id || ''} queues={queues} role={role} />
          )}

          {activeTab === 'locks' && <Locks />}
        </main>
      </div>
    </div>
  );
}
