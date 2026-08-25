import { User, Organization, OrganizationMembership } from '../types/index.js';
export declare class AuthService {
    static registerUserWithOrg(params: {
        email: string;
        password: string;
        fullName: string;
        orgName: string;
        orgSlug?: string;
    }): Promise<{
        user: User;
        organization: Organization;
        membership: OrganizationMembership;
    }>;
    static validateCredentials(email: string, password: string): Promise<User | null>;
    static getUserMemberships(userId: string): Promise<(OrganizationMembership & {
        organization_name: string;
        organization_slug: string;
    })[]>;
    static getUserById(id: string): Promise<User | null>;
}
