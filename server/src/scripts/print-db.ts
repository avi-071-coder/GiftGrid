import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const clips = await prisma.clip.findMany();
  console.log(JSON.stringify(clips, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
