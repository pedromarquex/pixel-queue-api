import { UseGuards } from '@nestjs/common';
import { Resolver, Mutation, Args, Query, Context } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { RegisterInput } from './graphql/inputs/register.input';
import { LoginInput } from './graphql/inputs/login.input';
import { AuthPayload } from './graphql/types/auth.payload';
import { UserType } from './graphql/types/user.type';
import { GqlAuthGuard } from './gql-auth.guard';
import { PrismaProvider } from 'src/providers/prisma/prisma.provider';

@Resolver()
export class AuthResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaProvider,
  ) {}

  @Mutation(() => AuthPayload)
  async register(@Args('input') input: RegisterInput) {
    return this.authService.register(input as any);
  }

  @Mutation(() => AuthPayload)
  async login(@Args('input') input: LoginInput) {
    return this.authService.login({ loginAuthDto: input as any });
  }

  @Query(() => [UserType])
  async users() {
    const users = await this.prisma.user.findMany();
    return users.map((u) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...rest } = u;
      return rest;
    });
  }

  @Query(() => UserType)
  @UseGuards(GqlAuthGuard)
  async me(@Context() ctx: any) {
    const req = ctx.req;
    const auth = req.user;
    if (!auth || !auth.userId) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: auth.userId },
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...rest } = user as any;
    return rest;
  }
}
