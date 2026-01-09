import { PrismaProvider } from './prisma.provider';

describe('PrismaProvider', () => {
  test('onModuleInit and onModuleDestroy call connect/disconnect', async () => {
    const provider = new PrismaProvider();
    jest.spyOn(provider, '$connect').mockResolvedValue(undefined as any);
    jest.spyOn(provider, '$disconnect').mockResolvedValue(undefined as any);

    await provider.onModuleInit();
    expect(provider.$connect).toHaveBeenCalled();

    await provider.onModuleDestroy();
    expect(provider.$disconnect).toHaveBeenCalled();
  });
});
