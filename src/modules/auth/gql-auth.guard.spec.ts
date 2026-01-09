import { GqlAuthGuard } from './gql-auth.guard';

describe('GqlAuthGuard', () => {
  test('class can be instantiated', () => {
    const g = new GqlAuthGuard();
    expect(g).toBeDefined();
  });
});
