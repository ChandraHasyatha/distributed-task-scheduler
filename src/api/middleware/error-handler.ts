import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { logger } from '../../core/logger/index.js';

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  logger.error({
    err: error,
    url: request.raw.url,
    method: request.raw.method,
  });

  if (error instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload or parameters',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          issue: issue.message,
        })),
      },
    });
  }

  const statusCode = (error as any).statusCode || 500;
  const message = error.message || 'Internal Server Error';
  const code = (error as any).code || (statusCode === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');

  return reply.status(statusCode).send({
    success: false,
    error: {
      code,
      message,
    },
  });
}
