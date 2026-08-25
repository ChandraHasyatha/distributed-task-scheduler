import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import rateLimit from '@fastify/rate-limit';
import { config } from '../core/config.js';
import { logger } from '../core/logger/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { registerRoutes } from './routes/index.js';
import { registerWebsocket } from './websocket.js';

export async function buildApp() {
  const fastify = Fastify({
    logger: false,
  });

  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(jwt, {
    secret: config.jwtSecret,
  });

  // RATE LIMITING (bonus feature): protects the API from abuse/runaway
  // clients. Global default is generous; auth endpoints are throttled
  // more tightly per-route below (see routes/index.ts) to slow down
  // credential-stuffing attempts.
  await fastify.register(rateLimit, {
    global: true,
    max: config.rateLimit.globalMax,
    timeWindow: config.rateLimit.globalWindowMs,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: `Rate limit exceeded. Retry in ${Math.ceil(context.ttl / 1000)}s.`,
    }),
  });

  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Distributed Job Scheduler API',
        description: 'Production-grade distributed job scheduler with atomic claiming',
        version: '1.0.0',
      },
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // WEBSOCKET LIVE UPDATES (bonus feature): /ws pushes job/queue/worker/DLQ
  // change events to connected dashboard clients.
  await registerWebsocket(fastify);

  fastify.setErrorHandler(errorHandler);
  await registerRoutes(fastify);

  return fastify;
}

export async function startServer() {
  const app = await buildApp();
  try {
    const address = await app.listen({ port: config.port, host: config.host });
    logger.info(`Server running at ${address}`);
    logger.info(`API documentation available at ${address}/docs`);
    return app;
  } catch (err: any) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
