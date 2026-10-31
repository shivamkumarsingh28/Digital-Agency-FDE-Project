import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ALL_ENTITIES } from '../entities';

/** Registers every repository once so feature modules can inject them. */
@Global()
@Module({ imports: [TypeOrmModule.forFeature(ALL_ENTITIES)], exports: [TypeOrmModule] })
export class DatabaseModule {}
