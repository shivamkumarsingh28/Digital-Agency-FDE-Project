import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditInterceptor } from './common/audit.interceptor';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { ALL_ENTITIES } from './entities';
import { AssetsModule } from './modules/assets.module';
import { AuthModule } from './modules/auth.module';
import { DatabaseModule } from './modules/database.module';
import { HealthController } from './modules/health.controller';
import { InvoicesModule } from './modules/invoices.module';
import { ProjectsModule } from './modules/projects.module';
import { TenantsModule } from './modules/tenants.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        type: 'postgres' as const,
        host: c.get<string>('DB_HOST') ?? 'localhost',
        port: Number(c.get<string>('DB_PORT') ?? 5432),
        username: c.get<string>('DB_USER') ?? 'saiam',
        password: c.get<string>('DB_PASSWORD') ?? 'saiam',
        database: c.get<string>('DB_NAME') ?? 'saiam',
        entities: ALL_ENTITIES,
        // Auto-sync is for local learning only. Use migrations in production (docs/DEPLOYMENT.md).
        synchronize: c.get<string>('DB_SYNC') === 'true',
      }),
    }),
    DatabaseModule, AuthModule, TenantsModule, ProjectsModule, AssetsModule, InvoicesModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard }, // everything requires a JWT unless @Public()
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
