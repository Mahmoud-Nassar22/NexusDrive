import { RequestMethod, ValidationPipe, type INestApplication, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

export interface BootstrapOptions {
  /** Path prefix the Ingress routes to this service, e.g. "api/files". */
  globalPrefix: string;
  defaultPort: number;
}

/**
 * Standard startup for every NexusDrive service, so they all behave the same:
 * JSON logging, DTO validation, graceful shutdown on SIGTERM, and
 * /health /ready /metrics kept at the root (outside the API prefix).
 */
export async function bootstrapService(
  appModule: Type<unknown>,
  options: BootstrapOptions,
): Promise<INestApplication> {
  const app = await NestFactory.create(appModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(options.globalPrefix, {
    exclude: ['health', 'ready', 'metrics'].map((path) => ({ path, method: RequestMethod.GET })),
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? options.defaultPort);
  await app.listen(port, '0.0.0.0');
  app.get(Logger).log(`listening on :${port} (prefix /${options.globalPrefix})`);
  return app;
}
