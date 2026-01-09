import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { PrismaProvider } from '../../providers/prisma/prisma.provider';

@Injectable()
export class InjectUserInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaProvider) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const currentRoute = request.route?.path ?? '';

    const routesPublicByPassInterptor = ['/auth/login', '/auth/register'];

    const shouldBypass = routesPublicByPassInterptor.some(
      (route) => route === currentRoute,
    );
    if (shouldBypass) return next.handle();

    const payload = request.user;
    if (!payload?.userId) {
      return next.handle();
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user) {
        // user not found
        throw new ForbiddenException('Access denied. User not found');
      }

      if (!user.isActive) {
        throw new ForbiddenException('Access denied. User blocked');
      }

      request.userLogged = user;
      // return the handler result directly; tests may provide a minimal object
      // with a subscribe method and wrapping with rxjs `from` causes an
      // "invalid object where a stream was expected" error in unit tests.
      return next.handle();
    } catch (error) {
      // rethrow known ForbiddenException to preserve message
      if (error instanceof ForbiddenException) throw error;
      throw new ForbiddenException('Access denied. User not found');
    }
  }
}
