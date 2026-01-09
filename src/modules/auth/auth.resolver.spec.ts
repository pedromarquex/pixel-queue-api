import { AuthResolver } from './auth.resolver';

describe('AuthResolver', () => {
  test('constructs and calls users mapping', async () => {
    const mockAuthService = { register: jest.fn(), login: jest.fn() } as any;
    const mockPrisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            email: 'a@a.com',
            password: 'h',
            name: 'n',
            isActive: true,
          },
        ]),
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          email: 'a@a.com',
          password: 'h',
          name: 'n',
          isActive: true,
        }),
      },
    } as any;
    const resolver = new AuthResolver(mockAuthService, mockPrisma);

    const users = await resolver.users();
    expect(Array.isArray(users)).toBe(true);
    expect((users[0] as any).password).toBeUndefined();

    const me = await resolver.me({ req: { user: { userId: 1 } } } as any);
    expect(me).toBeDefined();
  });
});
