import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  test('validate returns object with userId and username', async () => {
    const s = new JwtStrategy();
    const res = await s.validate({ sub: 1, username: 'u' } as any);
    expect(res).toEqual({ userId: 1, username: 'u' });
  });
});
