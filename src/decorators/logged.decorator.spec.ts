import { loggedFactory } from './logged.decorator';

describe('LoggedDecorator', () => {
  test('returns request.user', () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 1 } }),
      }),
    } as any;
    const res = loggedFactory(null, ctx as any);
    expect(res).toEqual({ id: 1 });
  });
});
