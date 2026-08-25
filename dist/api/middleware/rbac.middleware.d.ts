import { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '../../core/types/index.js';
/**
 * ROLE-BASED ACCESS CONTROL
 * =========================
 * Roles come from `organization_memberships` (ADMIN / MEMBER / VIEWER)
 * and are embedded in the JWT at login/register time. `requireRole`
 * enforces a minimum role rank for a route:
 *   - VIEWER: read-only (default for any authenticated request)
 *   - MEMBER: can create/enqueue jobs, create schedules
 *   - ADMIN:  can pause/resume/delete queues, purge DLQ entries,
 *             manage retry policies, replay jobs
 *
 * Every privileged action is written to `audit_log` so who-did-what is
 * reconstructable after the fact.
 */
export declare function requireRole(minRole: UserRole): (request: FastifyRequest, reply: FastifyReply) => Promise<undefined>;
export declare function recordAudit(params: {
    userId?: string | null;
    role?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Record<string, any>;
}): Promise<void>;
