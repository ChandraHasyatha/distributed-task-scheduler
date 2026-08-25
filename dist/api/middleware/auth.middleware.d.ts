import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthTokenPayload } from '../../core/types/index.js';
declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: AuthTokenPayload;
        user: AuthTokenPayload;
    }
}
export declare function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<undefined>;
