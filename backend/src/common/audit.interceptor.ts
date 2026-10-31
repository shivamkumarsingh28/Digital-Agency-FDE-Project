import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { tap } from 'rxjs';
import { AuditLog } from '../entities';

/** Writes an audit_logs row for every successful mutation by an authenticated user. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(@InjectRepository(AuditLog) private repo: Repository<AuditLog>) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next.handle();
    return next.handle().pipe(
      tap(() => {
        if (!req.user) return;
        this.repo
          .save({ userId: req.user.userId, action: `${req.method} ${req.route?.path ?? req.url}`, ipAddress: req.ip })
          .catch((error: unknown) => {
            this.logger.error('Failed to write audit log', error instanceof Error ? error.stack : String(error));
          });
      }),
    );
  }
}
