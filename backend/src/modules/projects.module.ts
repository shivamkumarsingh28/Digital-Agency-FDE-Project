import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { In, Repository } from 'typeorm';
import { CurrentUser, Roles } from '../common/decorators';
import { assertOrgAccess, orgScope } from '../common/tenancy';
import { AuthUser, RoleName } from '../common/types';
import { Deliverable, DeliverableStatus as S, Project, ProjectStatus } from '../entities';

const MANAGERS = [RoleName.SYSTEM_ADMIN, RoleName.ACCOUNT_MANAGER];
const INTERNAL = [...MANAGERS, RoleName.SPECIALIST];
const CLIENT_VISIBLE = [S.PENDING_CLIENT_APPROVAL, S.APPROVED, S.REVISION_REQUESTED];

export class CreateProjectDto {
  @IsUUID() orgId: string;
  @IsString() title: string;
  @IsOptional() @IsNumber() @Min(0) budget?: number;
  @IsOptional() @IsDateString() startDate?: string;
}
export class UpdateProjectDto {
  @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
}
export class CreateDeliverableDto {
  @IsString() title: string;
  @IsOptional() @IsDateString() dueDate?: string;
}
export class TransitionDto {
  @IsEnum(S) to: S;
  @IsOptional() @IsString() feedback?: string;
}

/** Finite state machine for deliverables (see docs/ARCHITECTURE.md). */
export const TRANSITIONS: Record<S, { to: S; roles: RoleName[] }[]> = {
  [S.DRAFT]: [{ to: S.IN_INTERNAL_REVIEW, roles: INTERNAL }],
  [S.IN_INTERNAL_REVIEW]: [
    { to: S.PENDING_CLIENT_APPROVAL, roles: MANAGERS },
    { to: S.DRAFT, roles: INTERNAL },
  ],
  [S.PENDING_CLIENT_APPROVAL]: [
    { to: S.APPROVED, roles: [RoleName.CLIENT_ADMIN] },
    { to: S.REVISION_REQUESTED, roles: [RoleName.CLIENT_ADMIN, RoleName.CLIENT_REVIEWER] },
  ],
  [S.REVISION_REQUESTED]: [{ to: S.IN_INTERNAL_REVIEW, roles: INTERNAL }],
  [S.APPROVED]: [],
};

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project) private projects: Repository<Project>,
    @InjectRepository(Deliverable) private deliverables: Repository<Deliverable>,
  ) {}

  list(user: AuthUser, orgId?: string) {
    return this.projects.find({ where: orgScope(user, orgId), relations: { org: true }, order: { title: 'ASC' } });
  }

  async get(user: AuthUser, id: string) {
    const p = await this.projects.findOne({ where: { id }, relations: { org: true } });
    if (!p) throw new NotFoundException('Project not found');
    assertOrgAccess(user, p.orgId);
    return p;
  }

  create(dto: CreateProjectDto) {
    return this.projects.save(this.projects.create({ ...dto, budget: String(dto.budget ?? 0), startDate: dto.startDate ?? null }));
  }

  async update(user: AuthUser, id: string, dto: UpdateProjectDto) {
    const p = await this.get(user, id);
    if (dto.status) p.status = dto.status;
    return this.projects.save(p);
  }

  async listDeliverables(user: AuthUser, projectId: string) {
    await this.get(user, projectId);
    return this.deliverables.find({
      where: { projectId, ...(user.isInternal ? {} : { approvalStatus: In(CLIENT_VISIBLE) }) },
      order: { dueDate: 'ASC' },
    });
  }

  async createDeliverable(user: AuthUser, projectId: string, dto: CreateDeliverableDto) {
    await this.get(user, projectId);
    return this.deliverables.save(this.deliverables.create({ projectId, title: dto.title, dueDate: dto.dueDate ? new Date(dto.dueDate) : null }));
  }

  /** Loads a deliverable and enforces tenant access via its parent project. */
  async getDeliverable(user: AuthUser, id: string) {
    const d = await this.deliverables.findOne({ where: { id }, relations: { project: true } });
    if (!d) throw new NotFoundException('Deliverable not found');
    assertOrgAccess(user, d.project.orgId);
    if (!user.isInternal && !CLIENT_VISIBLE.includes(d.approvalStatus)) throw new NotFoundException('Deliverable not found');
    return d;
  }

  async transition(user: AuthUser, id: string, dto: TransitionDto) {
    const d = await this.getDeliverable(user, id);
    const rule = TRANSITIONS[d.approvalStatus].find((t) => t.to === dto.to);
    if (!rule) throw new BadRequestException(`Cannot move from ${d.approvalStatus} to ${dto.to}`);
    if (!user.roles.some((r) => rule.roles.includes(r))) throw new ForbiddenException('Your role cannot make this transition');
    if (dto.to === S.REVISION_REQUESTED && !dto.feedback?.trim()) {
      throw new BadRequestException('Feedback is required when requesting a revision');
    }
    d.approvalStatus = dto.to;
    if (dto.feedback) d.feedback = dto.feedback;
    return this.deliverables.save(d);
  }
}

@ApiTags('projects')
@ApiBearerAuth()
@Controller()
export class ProjectsController {
  constructor(private svc: ProjectsService) {}

  @Get('projects') list(@CurrentUser() u: AuthUser, @Query('orgId') orgId?: string) { return this.svc.list(u, orgId); }
  @Get('projects/:id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }

  @Roles(...MANAGERS) @Post('projects')
  create(@Body() dto: CreateProjectDto) { return this.svc.create(dto); }

  @Roles(...MANAGERS) @Patch('projects/:id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto) {
    return this.svc.update(u, id, dto);
  }

  @Get('projects/:id/deliverables')
  deliverables(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.listDeliverables(u, id); }

  @Roles(...MANAGERS) @Post('projects/:id/deliverables')
  createDeliverable(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateDeliverableDto) {
    return this.svc.createDeliverable(u, id, dto);
  }

  @Patch('deliverables/:id/transition')
  transition(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionDto) {
    return this.svc.transition(u, id, dto);
  }
}

@Module({ providers: [ProjectsService], controllers: [ProjectsController], exports: [ProjectsService] })
export class ProjectsModule {}
