export async function authenticate(request, reply) {
    try {
        await request.jwtVerify();
    }
    catch (err) {
        return reply.status(401).send({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Invalid or missing authentication token',
            },
        });
    }
}
//# sourceMappingURL=auth.middleware.js.map