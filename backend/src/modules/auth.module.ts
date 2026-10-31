import { Body, Controller, Get, Injectable, Module, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { CurrentUser, Public } from '../common/decorators';
import { AuthUser, RoleName } from '../common/types';
import { User, UserStatus } from '../entities';

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}

@Injectable()
export class AuthService {
  constructor(@InjectRepository(User) private users: Repository<User>, private jwt: JwtService) {}

  async login(dto: LoginDto) {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .leftJoinAndSelect('u.roles', 'r')
      .leftJoinAndSelect('u.org', 'o')
      .where('u.email = :email', { email: dto.email.toLowerCase() })
      .getOne();
    const ok = user && user.status === UserStatus.ACTIVE && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');
    const me = this.toAuthUser(user);
    const accessToken = await this.jwt.signAsync({
      sub: me.userId, orgId: me.orgId, email: me.email, roles: me.roles, isInternal: me.isInternal,
    });
    return { accessToken, user: { ...me, fullName: user.fullName, orgName: user.org.name } };
  }

  private toAuthUser(u: User): AuthUser {
    return {
      userId: u.id, orgId: u.orgId, email: u.email,
      roles: u.roles.map((r) => r.roleName as RoleName), isInternal: u.org.isAgency,
    };
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }
  validate(p: any): AuthUser {
    return { userId: p.sub, orgId: p.orgId, email: p.email, roles: p.roles, isInternal: p.isInternal };
  }
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // brute-force protection
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        secret: c.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: c.get('JWT_EXPIRES_IN') ?? '8h' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
