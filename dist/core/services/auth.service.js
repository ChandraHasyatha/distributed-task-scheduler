import bcrypt from 'bcrypt';
import { query, withTransaction } from '../db/client.js';
const SALT_ROUNDS = 10;
export class AuthService {
    static async registerUserWithOrg(params) {
        const { email, password, fullName, orgName } = params;
        const orgSlug = params.orgSlug || orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        return withTransaction(async (client) => {
            // 1. Create Organization
            const orgRes = await client.query(`INSERT INTO organizations (name, slug)
         VALUES ($1, $2)
         RETURNING *`, [orgName, orgSlug]);
            const organization = orgRes.rows[0];
            // 2. Create User
            const userRes = await client.query(`INSERT INTO users (email, password_hash, full_name)
         VALUES ($1, $2, $3)
         RETURNING *`, [email.toLowerCase(), passwordHash, fullName]);
            const user = userRes.rows[0];
            // 3. Create Org Membership (ADMIN role for creator)
            const memRes = await client.query(`INSERT INTO organization_memberships (organization_id, user_id, role)
         VALUES ($1, $2, 'ADMIN')
         RETURNING *`, [organization.id, user.id]);
            const membership = memRes.rows[0];
            // 4. Create a default project
            await client.query(`INSERT INTO projects (organization_id, name, slug)
         VALUES ($1, 'Default Project', 'default-project')`, [organization.id]);
            return { user, organization, membership };
        });
    }
    static async validateCredentials(email, password) {
        const res = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        if (res.rows.length === 0)
            return null;
        const user = res.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        return valid ? user : null;
    }
    static async getUserMemberships(userId) {
        const res = await query(`SELECT m.*, o.name as organization_name, o.slug as organization_slug
       FROM organization_memberships m
       JOIN organizations o ON m.organization_id = o.id
       WHERE m.user_id = $1`, [userId]);
        return res.rows;
    }
    static async getUserById(id) {
        const res = await query('SELECT * FROM users WHERE id = $1', [id]);
        return res.rows[0] || null;
    }
}
//# sourceMappingURL=auth.service.js.map