import {
  BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, Post, Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsEnum, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Repository } from 'typeorm';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { orgScope } from '../common/tenancy';
import { AuthUser, RoleName } from '../common/types';
import { Organization, Role, User } from '../entities';

export class CreateOrgDto {
  @IsString() name: string;
  @IsOptional() @IsString() customDomain?: string;
  @IsOptional() @IsObject() brandConfig?: Record<string, any>;
}
export class CreateUserDto {
  @IsUUID() orgId: string;
  @IsEmail() email: string;
  @IsString() fullName: string;
  @IsString() @MinLength(8) password: string;
  @IsEnum(RoleName) role: RoleName;
}

const CLIENT_ROLES = [RoleName.CLIENT_ADMIN, RoleName.CLIENT_REVIEWER];

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Organization) private orgs: Repository<Organization>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Role) private roles: Repository<Role>,
  ) {}

  listOrgs() { return this.orgs.find({ order: { name: 'ASC' } }); }

  async createOrg(dto: CreateOrgDto) {
    if (dto.customDomain && (await this.orgs.findOneBy({ customDomain: dto.customDomain }))) {
      throw new ConflictException('Custom domain already in use');
    }
    return this.orgs.save(this.orgs.create({ ...dto, customDomain: dto.customDomain ?? null, isAgency: false }));
  }

  listUsers(actor: AuthUser, orgId?: string) {
    return this.users.find({ where: orgScope(actor, orgId), relations: { roles: true }, order: { fullName: 'ASC' } });
  }

  async createUser(dto: CreateUserDto) {
    const org = await this.orgs.findOneBy({ id: dto.orgId });
    if (!org) throw new BadRequestException('Organization not found');
    const clientRole = CLIENT_ROLES.includes(dto.role);
    if (org.isAgency === clientRole) throw new BadRequestException('Role does not match organization type');
    if (await this.users.findOneBy({ email: dto.email.toLowerCase() })) throw new ConflictException('Email already registered');
    const role = await this.roles.findOneByOrFail({ roleName: dto.role });
    const user = this.users.create({
      orgId: dto.orgId, email: dto.email.toLowerCase(), fullName: dto.fullName,
      passwordHash: await bcrypt.hash(dto.password, 12), roles: [role],
    });
    const saved = await this.users.save(user);
    return { id: saved.id, email: saved.email, fullName: saved.fullName, role: dto.role };
  }

  /** White-label lookup: custom domain -> brand_config (public, cacheable). */
  async branding(host?: string) {
    const org = host ? await this.orgs.findOneBy({ customDomain: host }) : null;
    const fallback = await this.orgs.findOneBy({ isAgency: true });
    const o = org ?? fallback;
    return { name: o?.name ?? 'Saiam', brand: o?.brandConfig ?? {} };
  }
}

@ApiTags('tenants')
@ApiBearerAuth()
@Controller()
export class TenantsController {
  constructor(private svc: TenantsService) {}

  @Public() @Get('public/branding')
  branding(@Query('host') host?: string) { return this.svc.branding(host); }

  @Roles(RoleName.SYSTEM_ADMIN, RoleName.ACCOUNT_MANAGER)
  @Get('organizations') orgs() { return this.svc.listOrgs(); }

  @Roles(RoleName.SYSTEM_ADMIN, RoleName.ACCOUNT_MANAGER)
  @Post('organizations') createOrg(@Body() dto: CreateOrgDto) { return this.svc.createOrg(dto); }

  @Roles(RoleName.SYSTEM_ADMIN, RoleName.ACCOUNT_MANAGER, RoleName.CLIENT_ADMIN)
  @Get('users') users(@CurrentUser() u: AuthUser, @Query('orgId') orgId?: string) { return this.svc.listUsers(u, orgId); }

  @Roles(RoleName.SYSTEM_ADMIN, RoleName.ACCOUNT_MANAGER)
  @Post('users') createUser(@Body() dto: CreateUserDto) { return this.svc.createUser(dto); }
}

@Module({ providers: [TenantsService], controllers: [TenantsController], exports: [TenantsService] })
export class TenantsModule {}
