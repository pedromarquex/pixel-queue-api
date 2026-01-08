import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const existingUser = await prisma.user.count();

  if (existingUser === 0) {
    const plainPassword = 'admin12';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const userClient = await prisma.user.create({
      data: {
        name: 'Master',
        email: 'master@gmail.com',
        password: hashedPassword,
      },
    });

    console.log('✅ User Seed success:', userClient);
  } else {
    console.log('⚠️ Database was initialized.');
  }
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
