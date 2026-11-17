import { DynamicModule, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

const QUIET_PATHS = ['/health', '/ready', '/metrics'];

/** JSON logs to stdout (picked up by Loki in the cluster). */
export function createLoggerModule(serviceName: string): DynamicModule {
  return LoggerModule.forRoot({
    // Nest 11 (path-to-regexp v8) syntax for "every route"; the default "*" logs a warning.
    forRoutes: [{ path: '{*splat}', method: RequestMethod.ALL }],
    pinoHttp: {
      name: serviceName,
      level: process.env.LOG_LEVEL ?? 'info',
      autoLogging: { ignore: (req) => QUIET_PATHS.includes(req.url ?? '') },
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  });
}
