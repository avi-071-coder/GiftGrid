import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TAXONOMY_MAP = {
  "Outfits": ["Clothing", "Footwear", "Bags"],
  "Accessories": ["Jewelry", "Watches", "Eyewear", "Misc"],
  "Household": ["Kitchenware", "Decor", "Furniture"],
  "Electronics": ["Phones & Tablets", "Gadgets & Smart Home", "Audio", "Computing & Gaming"],
  "Leisure": ["Beauty & Personal Care", "Books & Stationery", "Games & Toys", "Fitness & Outdoors", "Other"]
};

function normalizeTag(rawUmbrella: string, rawType: string) {
  const cleanUmbrella = (rawUmbrella || '').trim();
  const cleanType = (rawType || '').trim();

  const matchedUmbrellaKey = Object.keys(TAXONOMY_MAP).find(
    (key) => key.toLowerCase() === cleanUmbrella.toLowerCase()
  );

  if (matchedUmbrellaKey) {
    const allowedTypes = TAXONOMY_MAP[matchedUmbrellaKey as keyof typeof TAXONOMY_MAP];
    const matchedType = allowedTypes.find(
      (t) => t.toLowerCase() === cleanType.toLowerCase()
    );

    return {
      umbrella: matchedUmbrellaKey,
      type: matchedType || (cleanType.charAt(0).toUpperCase() + cleanType.slice(1))
    };
  }

  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
  return {
    umbrella: capitalize(cleanUmbrella),
    type: capitalize(cleanType)
  };
}

async function main() {
  const clips = await prisma.clip.findMany();
  console.log(`Found ${clips.length} clips to process.`);

  let updatedCount = 0;
  for (const clip of clips) {
    const normalized = normalizeTag(clip.umbrellaTag, clip.typeTag);
    if (normalized.umbrella !== clip.umbrellaTag || normalized.type !== clip.typeTag) {
      await prisma.clip.update({
        where: { id: clip.id },
        data: {
          umbrellaTag: normalized.umbrella,
          typeTag: normalized.type
        }
      });
      console.log(`Updated Clip "${clip.title}": "${clip.umbrellaTag}" -> "${normalized.umbrella}", "${clip.typeTag}" -> "${normalized.type}"`);
      updatedCount++;
    }
  }

  console.log(`Migration complete. Updated ${updatedCount} clips.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
