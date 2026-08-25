import { query } from '../db/client.js';
export class ProjectService {
    static async createProject(params) {
        const { organizationId, name } = params;
        const slug = params.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const res = await query(`INSERT INTO projects (organization_id, name, slug)
       VALUES ($1, $2, $3)
       RETURNING *`, [organizationId, name, slug]);
        return res.rows[0];
    }
    static async listProjectsByOrg(organizationId) {
        const res = await query('SELECT * FROM projects WHERE organization_id = $1 ORDER BY created_at ASC', [organizationId]);
        return res.rows;
    }
    static async getProjectById(id) {
        const res = await query('SELECT * FROM projects WHERE id = $1', [id]);
        return res.rows[0] || null;
    }
}
//# sourceMappingURL=project.service.js.map