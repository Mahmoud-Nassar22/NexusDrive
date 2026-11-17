import {
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Header,
  HttpException,
  Injectable,
  Module,
  NestInterceptor,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { Request, Response } from 'express';
import { collectDefaultMetrics, Histogram, register } from 'prom-client';
import { Observable, tap } from 'rxjs';

collectDefaultMetrics();

const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

/**
 * Records request rate, errors and duration (RED metrics) per route.
 * Note: requests rejected by a guard (401/403) never reach interceptors, so they
 * are not counted here. Use the ingress controller's metrics for those.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    // Use the route pattern (/files/:name), not the raw URL, to keep label cardinality low.
    const route = (req.route?.path as string | undefined) ?? 'unknown';
    const end = httpDuration.startTimer({ method: req.method, route });
    return next.handle().pipe(
      tap({
        next: () => end({ status: String(res.statusCode) }),
        // On errors the exception filter hasn't set res.statusCode yet, so read it from the error.
        error: (err: unknown) =>
          end({ status: String(err instanceof HttpException ? err.getStatus() : 500) }),
      }),
    );
  }
}

@Controller()
export class MetricsController {
  @Get('metrics')
  @Header('Content-Type', register.contentType)
  metrics(): Promise<string> {
    return register.metrics();
  }
}

@Module({
  controllers: [MetricsController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor }],
})
export class MetricsModule {}
