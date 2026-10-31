import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { RoleName } from './common/types';
import {
  Deliverable, DeliverableStatus, Invoice, InvoiceStatus, Organization, Project, ProjectStatus, Role, User,
} from './entities';

/** Idempotent demo data so you can log in right after `docker compose up`. */
async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const ds = app.get(DataSource);
  const roles = ds.getRepository(Role);
  if (await roles.count()) { console.log('Seed skipped (data exists)'); return app.close(); }

  const perms: Record<RoleName, Record<string, boolean>> = {
    SYSTEM_ADMIN: { all: true },
    ACCOUNT_MANAGER: { manageTasks: true, manageInvoices: true, onboardClients: true },
    SPECIALIST: { uploadAssets: true },
    CLIENT_ADMIN: { approveDeliverables: true, payInvoices: true, manageTeam: true },
    CLIENT_REVIEWER: { reviewAssets: true },
  };
  const roleRows: Record<string, Role> = {};
  for (const name of Object.values(RoleName)) roleRows[name] = await roles.save(roles.create({ roleName: name, permissions: perms[name] }));

  const orgs = ds.getRepository(Organization);
  const agency = await orgs.save(orgs.create({
    name: 'Saiam Digital Agency', isAgency: true, customDomain: 'localhost',
    brandConfig: { primary: '#1E2A5A', accent: '#F2A900' },
  }));
  const acme = await orgs.save(orgs.create({
    name: 'Acme Fitness Co.', isAgency: false, customDomain: 'portal.acme.localhost',
    brandConfig: { primary: '#0F766E', accent: '#F97316' },
  }));

  const pw = process.env.SEED_PASSWORD ?? 'ChangeMe123!';
  const hash = await bcrypt.hash(pw, 12);
  const users = ds.getRepository(User);
  const mk = (orgId: string, email: string, fullName: string, role: RoleName) =>
    users.save(users.create({ orgId, email, fullName, passwordHash: hash, roles: [roleRows[role]] }));
  await mk(agency.id, 'admin@saiam.agency', 'Saiam Admin', RoleName.SYSTEM_ADMIN);
  await mk(agency.id, 'manager@saiam.agency', 'Account Manager', RoleName.ACCOUNT_MANAGER);
  await mk(agency.id, 'designer@saiam.agency', 'Studio Specialist', RoleName.SPECIALIST);
  await mk(acme.id, 'owner@acme.test', 'Acme Owner', RoleName.CLIENT_ADMIN);
  await mk(acme.id, 'reviewer@acme.test', 'Acme Reviewer', RoleName.CLIENT_REVIEWER);

  const projects = ds.getRepository(Project);
  const proj = await projects.save(projects.create({
    orgId: acme.id, title: 'Spring Campaign Reels', status: ProjectStatus.ACTIVE, budget: '4500', startDate: '2026-10-01',
  }));
  const dels = ds.getRepository(Deliverable);
  await dels.save([
    dels.create({ projectId: proj.id, title: 'Homepage hero video', approvalStatus: DeliverableStatus.PENDING_CLIENT_APPROVAL }),
    dels.create({ projectId: proj.id, title: 'Instagram Reel pack', approvalStatus: DeliverableStatus.DRAFT }),
  ]);
  const inv = ds.getRepository(Invoice);
  await inv.save(inv.create({ orgId: acme.id, projectId: proj.id, amount: '1500', status: InvoiceStatus.SENT, dueDate: '2026-11-15' }));

  console.log('Seeded demo data. Use the configured seed password to sign in.');
  await app.close();
}
seed().catch((e) => { console.error(e); process.exit(1); });
