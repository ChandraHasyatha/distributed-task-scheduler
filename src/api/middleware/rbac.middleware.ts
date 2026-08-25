import { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '../../core/types/index.js';
import { query } from '../../core/db/client.js';

const ROLE_RANK: Record<UserRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
};

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
export function requireRole(minRole: UserRole) {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as any;
    const role: UserRole = (user?.role as UserRole) || 'VIEWER';

    if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `This action requires ${minRole} role or higher (you have ${role}).`,
        },
      });
    }
  };
}

export async function recordAudit(params: {
  userId?: string | null;
  role?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_log (user_id, role_at_time, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        params.userId || null,
        params.role || null,
        params.action,
        params.resourceType,
        params.resourceId || null,
        JSON.stringify(params.metadata || {}),
      ]
    );
  } catch {
    // Audit logging must never break the request path.
  }
}
