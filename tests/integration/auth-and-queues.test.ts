import { describe, it, expect, beforeAll } from 'vitest';
import { AuthService } from '../../src/core/services/auth.service.js';
import { ProjectService } from '../../src/core/services/project.service.js';
import { QueueService } from '../../src/core/services/queue.service.js';
import { initMemoryDatabase } from '../../src/core/db/client.js';

describe('Auth, Projects & Queues Integration', () => {
  beforeAll(() => {
    initMemoryDatabase();
  });

  let testOrgId: string;
  let testUserId: string;
  let testProjectId: string;

  it('should register a new user and organization', async () => {
    const res = await AuthService.registerUserWithOrg({
      email: 'architect@test.com',
      password: 'StrongPassword123!',
      fullName: 'Senior Architect',
      orgName: 'Acme Corp',
    });

    expect(res.user.id).toBeDefined();
    expect(res.user.email).toBe('architect@test.com');
    expect(res.organization.id).toBeDefined();
    expect(res.organization.name).toBe('Acme Corp');
    expect(res.membership.role).toBe('ADMIN');

    testOrgId = res.organization.id;
    testUserId = res.user.id;
  });

  it('should validate user login credentials', async () => {
    const valid = await AuthService.validateCredentials('architect@test.com', 'StrongPassword123!');
    expect(valid).not.toBeNull();
    expect(valid?.id).toBe(testUserId);

    const invalid = await AuthService.validateCredentials('architect@test.com', 'WrongPassword');
    expect(invalid).toBeNull();
  });

  it('should create and list projects for organization', async () => {
    const project = await ProjectService.createProject({
      organizationId: testOrgId,
      name: 'Payment Processing Pipeline',
    });

    expect(project.id).toBeDefined();
    expect(project.name).toBe('Payment Processing Pipeline');
    expect(project.slug).toBe('payment-processing-pipeline');
    testProjectId = project.id;

    const list = await ProjectService.listProjectsByOrg(testOrgId);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it('should create, configure, pause, and resume queues', async () => {
    const queue = await QueueService.createQueue({
      projectId: testProjectId,
      name: 'transaction-emails',
      priority: 20,
      concurrencyLimit: 4,
    });

    expect(queue.id).toBeDefined();
    expect(queue.name).toBe('transaction-emails');
    expect(queue.priority).toBe(20);
    expect(queue.concurrency_limit).toBe(4);
    expect(queue.is_paused).toBe(false);

    // Pause queue
    const paused = await QueueService.setPaused(queue.id, true);
    expect(paused?.is_paused).toBe(true);

    // Resume queue
    const resumed = await QueueService.setPaused(queue.id, false);
    expect(resumed?.is_paused).toBe(false);

    // Update queue
    const updated = await QueueService.updateQueue(queue.id, {
      priority: 30,
      concurrencyLimit: 8,
    });
    expect(updated?.priority).toBe(30);
    expect(updated?.concurrency_limit).toBe(8);
  });
});
