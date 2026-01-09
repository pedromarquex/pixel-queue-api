jest.mock('@prisma/client', () => {
  const user = {
    findFirst: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  };
  const PrismaClient = jest.fn().mockImplementation(() => ({ user }));
  return { PrismaClient };
});

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaClient } from '@prisma/client';

const mockPrisma = new PrismaClient() as any;

const mockJwtService = { sign: jest.fn().mockReturnValue('token') } as any;

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(mockJwtService);
  });

  test('login throws when user not found', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.login({
        loginAuthDto: {
          email: 'a@a.com',
          password: 'pass',
        },
      }),
    ).rejects.toThrow();
  });

  test('login throws when invalid password', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 1,
      email: 'a@a.com',
      password: 'hashed',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({
        loginAuthDto: {
          email: 'a@a.com',
          password: 'pass',
        },
      }),
    ).rejects.toThrow();
  });

  test('login returns token and user without password', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 1,
      email: 'a@a.com',
      password: 'hashed',
      name: 'n',
      createdAt: new Date(),
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const res = await service.login({
      loginAuthDto: {
        email: 'a@a.com',
        password: 'pass',
      },
    });

    expect(res.accessToken).toBe('token');
    expect((res.user as any).password).toBeUndefined();
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: 'a@a.com' },
    });
    expect(mockJwtService.sign).toHaveBeenCalled();
  });

  test('register creates user and returns token', async () => {
    const props = { name: 'n', email: 'e@e.com', password: 'pass' } as any;
    mockPrisma.user.findFirst.mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
    mockPrisma.user.create.mockResolvedValue({
      id: 2,
      ...props,
      password: 'hashed',
      isActive: true,
      createdAt: new Date(),
    });

    const res = await service.register(props);

    expect(res.accessToken).toBe('token');
    expect((res.user as any).password).toBeUndefined();
    expect(mockPrisma.user.create).toHaveBeenCalled();
  });

  test('validateUser returns user without password on correct credentials', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 1,
      email: 'a@a.com',
      password: 'hashed',
      name: 'n',
      createdAt: new Date(),
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const user = await service.validateUser('a@a.com', 'pass');

    expect(user).toEqual(
      expect.objectContaining({
        email: 'a@a.com',
        name: 'n',
      }),
    );
    expect((user as any).password).toBeUndefined();
  });
});
