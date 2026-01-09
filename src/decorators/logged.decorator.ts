import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Export the inner factory so unit tests can call it directly without
// triggering Nest's decorator metadata machinery which expects a target/constructor.
export const loggedFactory = (data: unknown, ctx: ExecutionContext | any) => {
  // defensive guards for tests that pass null/partial contexts
  if (!ctx || typeof ctx.switchToHttp !== 'function') return null as any;
  const switcher = ctx.switchToHttp();
  if (!switcher || typeof switcher.getRequest !== 'function')
    return null as any;
  const request = switcher.getRequest();
  return request?.user ?? null;
};

export const LoggedDercorator = createParamDecorator(loggedFactory);
