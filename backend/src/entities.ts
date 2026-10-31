import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne,
  PrimaryGeneratedColumn, Relation,
} from 'typeorm';

export enum UserStatus { ACTIVE = 'ACTIVE', SUSPENDED = 'SUSPENDED', INVITED = 'INVITED' }
export enum ProjectStatus { PLANNING = 'PLANNING', ACTIVE = 'ACTIVE', ON_HOLD = 'ON_HOLD', COMPLETED = 'COMPLETED' }
export enum DeliverableStatus {
  DRAFT = 'DRAFT',
  IN_INTERNAL_REVIEW = 'IN_INTERNAL_REVIEW',
  PENDING_CLIENT_APPROVAL = 'PENDING_CLIENT_APPROVAL',
  APPROVED = 'APPROVED',
  REVISION_REQUESTED = 'REVISION_REQUESTED',
}
export enum InvoiceStatus { DRAFT = 'DRAFT', SENT = 'SENT', PAID = 'PAID', OVERDUE = 'OVERDUE' }
export enum AssetVisibility { INTERNAL = 'INTERNAL', CLIENT = 'CLIENT' }

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid', { name: 'org_id' }) id: string;
  @Column({ length: 200 }) name: string;
  @Index({ unique: true })
  @Column({ name: 'custom_domain', type: 'varchar', length: 255, nullable: true }) customDomain: string | null;
  @Column({ name: 'is_agency', default: false }) isAgency: boolean;
  @Column({ name: 'brand_config', type: 'jsonb', default: {} }) brandConfig: Record<string, any>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

@Entity('roles_permissions')
export class Role {
  @PrimaryGeneratedColumn('uuid', { name: 'role_id' }) id: string;
  @Column({ name: 'role_name', unique: true, length: 50 }) roleName: string;
  @Column({ type: 'jsonb', default: {} }) permissions: Record<string, any>;
}

@Entity('users')
@Index(['orgId', 'email'])
export class User {
  @PrimaryGeneratedColumn('uuid', { name: 'user_id' }) id: string;
  @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'org_id' }) org: Relation<Organization>;
  @Column({ unique: true, length: 255 }) email: string;
  @Column({ name: 'full_name', length: 200 }) fullName: string;
  @Column({ name: 'password_hash', select: false }) passwordHash: string;
  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE }) status: UserStatus;
  @Column({ name: 'mfa_enabled', default: false }) mfaEnabled: boolean;
  @ManyToMany(() => Role, { eager: true })
  @JoinTable({ name: 'user_roles', joinColumn: { name: 'user_id' }, inverseJoinColumn: { name: 'role_id' } })
  roles: Relation<Role>[];
}

@Entity('projects')
@Index(['orgId', 'status'])
export class Project {
  @PrimaryGeneratedColumn('uuid', { name: 'project_id' }) id: string;
  @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'org_id' }) org: Relation<Organization>;
  @Column({ length: 200 }) title: string;
  @Column({ type: 'enum', enum: ProjectStatus, default: ProjectStatus.PLANNING }) status: ProjectStatus;
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 }) budget: string;
  @Column({ name: 'start_date', type: 'date', nullable: true }) startDate: string | null;
}

@Entity('deliverables')
@Index(['projectId', 'approvalStatus'])
export class Deliverable {
  @PrimaryGeneratedColumn('uuid', { name: 'deliverable_id' }) id: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId: string;
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' }) project: Relation<Project>;
  @Column({ length: 200 }) title: string;
  @Column({ name: 'approval_status', type: 'enum', enum: DeliverableStatus, default: DeliverableStatus.DRAFT })
  approvalStatus: DeliverableStatus;
  @Column({ type: 'text', nullable: true }) feedback: string | null;
  @Column({ name: 'due_date', type: 'timestamptz', nullable: true }) dueDate: Date | null;
}

@Entity('document_assets')
@Index(['deliverableId'])
export class DocumentAsset {
  @PrimaryGeneratedColumn('uuid', { name: 'asset_id' }) id: string;
  @Column({ name: 'deliverable_id', type: 'uuid' }) deliverableId: string;
  @ManyToOne(() => Deliverable, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deliverable_id' }) deliverable: Relation<Deliverable>;
  @Column({ name: 'file_path', length: 500 }) filePath: string;
  @Column({ name: 'file_name', length: 255 }) fileName: string;
  @Column({ name: 'file_size', type: 'int', default: 0 }) fileSize: number;
  @Column({ type: 'int', default: 1 }) version: number;
  @Column({ type: 'enum', enum: AssetVisibility, default: AssetVisibility.INTERNAL }) visibility: AssetVisibility;
}

@Entity('invoices')
@Index(['orgId', 'status'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid', { name: 'invoice_id' }) id: string;
  @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'org_id' }) org: Relation<Organization>;
  @Column({ name: 'project_id', type: 'uuid', nullable: true }) projectId: string | null;
  @ManyToOne(() => Project, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'project_id' }) project: Relation<Project>;
  @Column({ type: 'numeric', precision: 12, scale: 2 }) amount: string;
  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT }) status: InvoiceStatus;
  @Column({ name: 'due_date', type: 'date' }) dueDate: string;
}

@Entity('audit_logs')
@Index(['timestamp', 'userId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid', { name: 'log_id' }) id: string;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' }) user: Relation<User>;
  @Column({ length: 255 }) action: string;
  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true }) ipAddress: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) timestamp: Date;
}

export const ALL_ENTITIES = [Organization, Role, User, Project, Deliverable, DocumentAsset, Invoice, AuditLog];
