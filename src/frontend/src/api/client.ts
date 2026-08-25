import {
  User,
  Project,
  Queue,
  Job,
  JobExecution,
  JobLog,
  ScheduledJob,
  DeadLetterEntry,
  Worker,
  SystemMetrics,
  UserRole,
  JobDependencyGraph,
  WebhookTrigger,
  DistributedLock,
} from '../types/index.js';

const API_BASE = 'https://distributed-task-scheduler-bu2i.onrender.com/api/v1';
/** Decodes the role claim out of a JWT without verifying it — verification
 *  happens server-side on every request; this is purely for UI gating
 *  (hiding/disabling buttons the user isn't allowed to use). */
function decodeRoleFromToken(token: string | null): UserRole | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return (payload.role as UserRole) || null;
  } catch {
    return null;
  }
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('djs_auth_token');
  }

  setToken(token: string | null) {
    this.token = token;

    if (token) {
      localStorage.setItem('djs_auth_token', token);
    } else {
      localStorage.removeItem('djs_auth_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  /** RBAC (bonus feature): current user's role, read from the JWT. */
  getRole(): UserRole | null {
    return decodeRoleFromToken(this.token);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      const errorMsg =
        data.error?.message ||
        response.statusText ||
        'API Request Failed';

      throw new Error(errorMsg);
    }

    return data.data !== undefined ? data.data : data;
  }

  // Auth
  async login(
    email: string,
    password: string
  ): Promise<{ token: string; user: User }> {
    const res = await this.request<{ token: string; user: User }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
        }),
      }
    );

    this.setToken(res.token);
    return res;
  }

  async register(params: {
    email: string;
    password: string;
    fullName: string;
    orgName: string;
  }): Promise<{ token: string; user: User }> {
    const res = await this.request<{ token: string; user: User }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );

    this.setToken(res.token);
    return res;
  }

  async getMe(): Promise<{
    user: User | null;
    memberships: any[];
  }> {
    return this.request<{
      user: User | null;
      memberships: any[];
    }>('/auth/me');
  }

  logout() {
    this.setToken(null);
  }

  // Projects
  async listProjects(organizationId?: string): Promise<Project[]> {
    const query = organizationId
      ? `?organizationId=${organizationId}`
      : '';

    return this.request<Project[]>(`/projects${query}`);
  }

  async createProject(
    name: string,
    organizationId?: string
  ): Promise<Project> {
    return this.request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify({
        name,
        organizationId,
      }),
    });
  }

  // Queues
  async listQueues(projectId: string): Promise<Queue[]> {
    return this.request<Queue[]>(
      `/projects/${projectId}/queues`
    );
  }

  async createQueue(
    projectId: string,
    params: {
      name: string;
      priority?: number;
      concurrencyLimit?: number;
      shardCount?: number;
    }
  ): Promise<Queue> {
    return this.request<Queue>(
      `/projects/${projectId}/queues`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  }

  async updateQueue(
    queueId: string,
    params: {
      priority?: number;
      concurrencyLimit?: number;
    }
  ): Promise<Queue> {
    return this.request<Queue>(
      `/queues/${queueId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(params),
      }
    );
  }

  async pauseQueue(queueId: string): Promise<Queue> {
    return this.request<Queue>(
      `/queues/${queueId}/pause`,
      {
        method: 'POST',
      }
    );
  }

  async resumeQueue(queueId: string): Promise<Queue> {
    return this.request<Queue>(
      `/queues/${queueId}/resume`,
      {
        method: 'POST',
      }
    );
  }

  async deleteQueue(
    queueId: string
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(
      `/queues/${queueId}`,
      {
        method: 'DELETE',
      }
    );
  }

  // Jobs
  async enqueueJob(
    queueId: string,
    params: {
      jobType: string;
      payload?: Record<string, any>;
      priority?: number;
      delayMs?: number;
      idempotencyKey?: string;
      maxAttempts?: number;
      timeoutMs?: number;
      dependsOn?: string[];
    }
  ): Promise<Job> {
    return this.request<Job>(
      `/queues/${queueId}/jobs`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  }

  async listJobs(
    queueId: string,
    filter: {
      status?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Job[]> {
    const params = new URLSearchParams();

    if (filter.status) {
      params.append('status', filter.status);
    }

    if (filter.search) {
      params.append('search', filter.search);
    }

    if (filter.limit) {
      params.append('limit', String(filter.limit));
    }

    if (filter.offset) {
      params.append('offset', String(filter.offset));
    }

    return this.request<Job[]>(
      `/queues/${queueId}/jobs?${params.toString()}`
    );
  }

  async getJob(jobId: string): Promise<Job> {
    return this.request<Job>(`/jobs/${jobId}`);
  }

  async cancelJob(jobId: string): Promise<Job> {
    return this.request<Job>(
      `/jobs/${jobId}/cancel`,
      {
        method: 'POST',
      }
    );
  }

  async getJobExecutions(
    jobId: string
  ): Promise<JobExecution[]> {
    return this.request<JobExecution[]>(
      `/jobs/${jobId}/executions`
    );
  }

  // WORKFLOW / DAG (bonus feature)
  async getJobDependencies(jobId: string): Promise<JobDependencyGraph> {
    return this.request<JobDependencyGraph>(
      `/jobs/${jobId}/dependencies`
    );
  }

  async getExecutionLogs(
    executionId: string
  ): Promise<JobLog[]> {
    return this.request<JobLog[]>(
      `/executions/${executionId}/logs`
    );
  }

  // Scheduled Jobs (Cron)
  async listScheduledJobs(
    projectId: string
  ): Promise<ScheduledJob[]> {
    return this.request<ScheduledJob[]>(
      `/projects/${projectId}/scheduled-jobs`
    );
  }

  async createScheduledJob(
    projectId: string,
    params: {
      queueId: string;
      name: string;
      cronExpression: string;
      jobType: string;
      payload?: Record<string, any>;
    }
  ): Promise<ScheduledJob> {
    return this.request<ScheduledJob>(
      `/projects/${projectId}/scheduled-jobs`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  }

  async toggleScheduledJob(
    id: string,
    isActive: boolean
  ): Promise<ScheduledJob> {
    return this.request<ScheduledJob>(
      `/scheduled-jobs/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          isActive,
        }),
      }
    );
  }

  async deleteScheduledJob(
    id: string
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(
      `/scheduled-jobs/${id}`,
      {
        method: 'DELETE',
      }
    );
  }

  // DLQ
  async listDlq(
    queueId?: string
  ): Promise<DeadLetterEntry[]> {
    const query = queueId
      ? `?queueId=${queueId}`
      : '';

    return this.request<DeadLetterEntry[]>(
      `/dlq${query}`
    );
  }

  async replayDlq(id: string): Promise<Job> {
    return this.request<Job>(
      `/dlq/${id}/retry`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      }
    );
  }

  async purgeDlq(
    id: string
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(
      `/dlq/${id}`,
      {
        method: 'DELETE',
      }
    );
  }

  // AI-GENERATED FAILURE SUMMARIES (bonus feature)
  async summarizeDlqEntry(id: string): Promise<{ summary: string }> {
    return this.request<{ summary: string }>(
      `/dlq/${id}/summarize`,
      { method: 'POST' }
    );
  }

  // EVENT-DRIVEN EXECUTION / WEBHOOKS (bonus feature)
  async listWebhooks(projectId: string): Promise<WebhookTrigger[]> {
    return this.request<WebhookTrigger[]>(
      `/projects/${projectId}/webhooks`
    );
  }

  async createWebhook(
    projectId: string,
    params: { queueId: string; name: string; jobType: string; defaultPriority?: number }
  ): Promise<WebhookTrigger> {
    return this.request<WebhookTrigger>(
      `/projects/${projectId}/webhooks`,
      { method: 'POST', body: JSON.stringify(params) }
    );
  }

  // DISTRIBUTED LOCKING (bonus feature) — observability
  async listLocks(): Promise<DistributedLock[]> {
    return this.request<DistributedLock[]>('/locks');
  }

  // Workers & Metrics
  async listWorkers(): Promise<Worker[]> {
    return this.request<Worker[]>('/workers');
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    return this.request<SystemMetrics>(
      '/metrics/system'
    );
  }
}

export const api = new ApiClient();