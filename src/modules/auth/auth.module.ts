import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { AuthResolver } from './auth.resolver';
import { GqlAuthGuard } from './gql-auth.guard';
import { PrismaProvider } from 'src/providers/prisma/prisma.provider';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: Number(process.env.JWT_EXPIRATION_TIME) },
    }),
  ],
  controllers: [],
  providers: [
    AuthService,
    JwtStrategy,
    AuthResolver,
    GqlAuthGuard,
    PrismaProvider,
  ],
  exports: [AuthService],
})
export class AuthModule {}
