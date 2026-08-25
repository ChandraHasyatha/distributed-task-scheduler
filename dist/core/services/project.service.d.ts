import { Project } from '../types/index.js';
export declare class ProjectService {
    static createProject(params: {
        organizationId: string;
        name: string;
        slug?: string;
    }): Promise<Project>;
    static listProjectsByOrg(organizationId: string): Promise<Project[]>;
    static getProjectById(id: string): Promise<Project | null>;
}
