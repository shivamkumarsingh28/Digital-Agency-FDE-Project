import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Repository } from 'typeorm';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser, RoleName } from '../common/types';
import { AssetVisibility, DocumentAsset } from '../entities';
import { ProjectsModule, ProjectsService } from './projects.module';

export class UploadUrlDto {
  @IsString() fileName: string;
  @IsInt() @Min(1) @Max(524288000) fileSize: number; // 500 MB cap
  @IsOptional() @IsEnum(AssetVisibility) visibility?: AssetVisibility;
}

@Injectable()
export class AssetsService {
  private s3: S3Client;
  private bucket: string;

  constructor(
    @InjectRepository(DocumentAsset) private assets: Repository<DocumentAsset>,
    private projects: ProjectsService,
    config: ConfigService,
  ) {
    this.bucket = config.get('S3_BUCKET') ?? 'saiam-vault';
    // Signed against the PUBLIC endpoint so browsers can reach the URL (MinIO locally, S3/R2 in cloud).
    this.s3 = new S3Client({
      region: config.get('S3_REGION') ?? 'us-east-1',
      endpoint: config.get('S3_PUBLIC_ENDPOINT'),
      forcePathStyle: true,
      credentials: { accessKeyId: config.getOrThrow('S3_ACCESS_KEY'), secretAccessKey: config.getOrThrow('S3_SECRET_KEY') },
    });
  }

  async createUpload(user: AuthUser, deliverableId: string, dto: UploadUrlDto) {
    const d = await this.projects.getDeliverable(user, deliverableId);
    const last = await this.assets.findOne({ where: { deliverableId }, order: { version: 'DESC' } });
    const version = (last?.version ?? 0) + 1;
    const safe = dto.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    // Convention from the system design: /projects/{project_id}/deliverables/{version}/
    const filePath = `projects/${d.projectId}/deliverables/${deliverableId}/v${version}/${safe}`;
    const asset = await this.assets.save(
      this.assets.create({ deliverableId, filePath, fileName: dto.fileName, fileSize: dto.fileSize, version, visibility: dto.visibility ?? AssetVisibility.INTERNAL }),
    );
    const uploadUrl = await getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: filePath }), { expiresIn: 600 });
    return { asset, uploadUrl };
  }

  async list(user: AuthUser, deliverableId: string) {
    await this.projects.getDeliverable(user, deliverableId);
    return this.assets.find({
      where: { deliverableId, ...(user.isInternal ? {} : { visibility: AssetVisibility.CLIENT }) },
      order: { version: 'DESC' },
    });
  }

  async downloadUrl(user: AuthUser, id: string) {
    const a = await this.assets.findOneBy({ id });
    if (!a) throw new NotFoundException('Asset not found');
    await this.projects.getDeliverable(user, a.deliverableId); // tenant check
    if (!user.isInternal && a.visibility !== AssetVisibility.CLIENT) throw new NotFoundException('Asset not found');
    const url = await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: a.filePath }), { expiresIn: 300 });
    return { url, expiresInSeconds: 300 };
  }
}

@ApiTags('vault')
@ApiBearerAuth()
@Controller()
export class AssetsController {
  constructor(private svc: AssetsService) {}

  @Roles(RoleName.SYSTEM_ADMIN, RoleName.ACCOUNT_MANAGER, RoleName.SPECIALIST)
  @Post('deliverables/:id/assets/upload-url')
  upload(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UploadUrlDto) {
    return this.svc.createUpload(u, id, dto);
  }

  @Get('deliverables/:id/assets')
  list(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.list(u, id); }

  @Get('assets/:id/download-url')
  download(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.downloadUrl(u, id); }
}

@Module({ imports: [ProjectsModule], providers: [AssetsService], controllers: [AssetsController] })
export class AssetsModule {}
