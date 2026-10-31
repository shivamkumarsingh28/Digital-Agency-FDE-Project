import {
  BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { Repository } from 'typeorm';
import { CurrentUser, Roles } from '../common/decorators';
import { assertOrgAccess, orgScope } from '../common/tenancy';
import { AuthUser, RoleName } from '../common/types';
import { Invoice, InvoiceStatus } from '../entities';

export class CreateInvoiceDto {
  @IsUUID() orgId: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsNumber() @Min(1) amount: number;
  @IsDateString() dueDate: string;
}

@Injectable()
export class InvoicesService {
  constructor(@InjectRepository(Invoice) private repo: Repository<Invoice>) {}

  list(user: AuthUser, orgId?: string) {
    const scope = orgScope(user, orgId);
    // Clients never see drafts.
    return this.repo.find({ where: scope, relations: { org: true, project: true }, order: { dueDate: 'DESC' } })
      .then((rows) => (user.isInternal ? rows : rows.filter((r) => r.status !== InvoiceStatus.DRAFT)));
  }

  create(dto: CreateInvoiceDto) {
    return this.repo.save(this.repo.create({ ...dto, amount: String(dto.amount), projectId: dto.projectId ?? null }));
  }

  private async load(user: AuthUser, id: string) {
    const inv = await this.repo.findOneBy({ id });
    if (!inv) throw new NotFoundException('Invoice not found');
    assertOrgAccess(user, inv.orgId);
    return inv;
  }

  async send(user: AuthUser, id: string) {
    const inv = await this.load(user, id);
    if (inv.status !== InvoiceStatus.DRAFT) throw new BadRequestException('Only draft invoices can be sent');
    inv.status = InvoiceStatus.SENT;
    return this.repo.save(inv);
  }

  /** Placeholder for a payment gateway: replace with a Stripe Checkout session + webhook (see docs/ROADMAP.md). */
  async pay(user: AuthUser, id: string) {
    const inv = await this.load(user, id);
    if (![InvoiceStatus.SENT, InvoiceStatus.OVERDUE].includes(inv.status)) throw new BadRequestException('Invoice is not payable');
    inv.status = InvoiceStatus.PAID;
    return this.repo.save(inv);
  }
}

@ApiTags('billing')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private svc: InvoicesService) {}

  @Roles(RoleName.SYSTEM_ADMIN, RoleName.ACCOUNT_MANAGER, RoleName.CLIENT_ADMIN)
  @Get() list(@CurrentUser() u: AuthUser, @Query('orgId') orgId?: string) { return this.svc.list(u, orgId); }

  @Roles(RoleName.SYSTEM_ADMIN, RoleName.ACCOUNT_MANAGER)
  @Post() create(@Body() dto: CreateInvoiceDto) { return this.svc.create(dto); }

  @Roles(RoleName.SYSTEM_ADMIN, RoleName.ACCOUNT_MANAGER)
  @Post(':id/send') send(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.send(u, id); }

  @Roles(RoleName.CLIENT_ADMIN)
  @Post(':id/pay') pay(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.pay(u, id); }
}

@Module({ providers: [InvoicesService], controllers: [InvoicesController] })
export class InvoicesModule {}
