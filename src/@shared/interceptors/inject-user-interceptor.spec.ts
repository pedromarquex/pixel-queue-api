import { InjectUserInterceptor } from './inject-user-interceptor';

describe('InjectUserInterceptor', () => {
  const mockPrisma = { user: { findUnique: jest.fn() } } as any;
  const interceptor = new InjectUserInterceptor(mockPrisma);

  const makeContext = (route = '/x', userPayload = { userId: 1 }) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ route: { path: route }, user: userPayload }),
      }),
    }) as any;

  test('bypasses public routes', async () => {
    const ctx = makeContext('/auth/login');
    const next = {
      handle: jest.fn().mockReturnValue({ subscribe: () => {} }),
    } as any;
    await interceptor.intercept(ctx, next as any);
    expect(next.handle).toHaveBeenCalled();
  });

  test('when payload missing, calls next', async () => {
    const ctx = makeContext('/private', {} as any);
    const next = {
      handle: jest.fn().mockReturnValue({ subscribe: () => {} }),
    } as any;
    await interceptor.intercept(ctx, next as any);
    expect(next.handle).toHaveBeenCalled();
  });

  test('injects user when found and active', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 1, isActive: true });
    const ctx = makeContext('/private', { userId: 1 });
    const next = {
      handle: jest.fn().mockReturnValue({ subscribe: () => {} }),
    } as any;
    await interceptor.intercept(ctx, next as any);
    expect(mockPrisma.user.findUnique).toHaveBeenCalled();
    expect(next.handle).toHaveBeenCalled();
  });

  test('throws when user not found or inactive', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 1, isActive: false });
    const ctx = makeContext('/private', { userId: 1 });
    const next = {
      handle: jest.fn().mockReturnValue({ subscribe: () => {} }),
    } as any;
    await expect(interceptor.intercept(ctx, next as any)).rejects.toThrow();
  });
});
