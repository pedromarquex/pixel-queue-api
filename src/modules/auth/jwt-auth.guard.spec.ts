import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  test('can be instantiated', () => {
    const g = new JwtAuthGuard();
    expect(g).toBeDefined();
  });
});
