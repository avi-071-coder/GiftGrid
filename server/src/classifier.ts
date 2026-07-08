export interface CategoryTag {
  umbrella: string;
  type: string;
}

const KNOWN_UMBRELLAS = ['Outfits', 'Electronics', 'Accessories', 'Household', 'Leisure'];

// Groq's endpoint is OpenAI-compatible — same chat.completions shape, different base URL
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Llama 3.1 8B Instant: fast, cheap-to-free, more than enough for classification
const MODEL = 'llama-3.1-8b-instant';

const TAXONOMY_MAP = {
  "Outfits": ["Clothing", "Footwear", "Bags"],
  "Accessories": ["Jewelry", "Watches", "Eyewear", "Misc"],
  "Household": ["Kitchenware", "Decor", "Furniture"],
  "Electronics": ["Phones & Tablets", "Gadgets & Smart Home", "Audio", "Computing & Gaming"],
  "Leisure": ["Beauty & Personal Care", "Books & Stationery", "Games & Toys", "Fitness & Outdoors", "Other"]
};

function normalizeTag(rawUmbrella: string, rawType: string): CategoryTag {
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

export async function classifyProduct(
  title: string,
  storeName: string,
  sourceUrl: string
): Promise<CategoryTag> {
  const systemPrompt = `You classify e-commerce products into exactly one of the following umbrella/type pairs:
${JSON.stringify(TAXONOMY_MAP, null, 2)}

Judge by what the product FUNDAMENTALLY IS, not by colors, materials, or marketing adjectives in the title (e.g. a "Gold iPhone" is Electronics/"Phones & Tablets", not Accessories/"Jewelry" — "gold" here is a color, not a jewelry indicator).
Respond ONLY with JSON: {"umbrella": "...", "type": "..."}. No other text, no markdown fences.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 100,
        temperature: 0, // deterministic classification, no creative variance
        response_format: { type: 'json_object' }, // forces valid JSON back
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Title: ${title}\nStore: ${storeName}\nURL: ${sourceUrl}`,
          },
        ],
      }),
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      // Rate limit (429) or transient error — fall through to safe default below
      console.error(`Groq classify failed: ${response.status}`);
      return { umbrella: 'Leisure', type: 'Other' };
    }

    const data = (await response.json()) as any;
    const text = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text);

    if (!parsed.umbrella || !parsed.type) {
      console.warn('Groq returned invalid JSON schema:', text);
      return { umbrella: 'Leisure', type: 'Other' };
    }

    return normalizeTag(parsed.umbrella, parsed.type);
  } catch (err) {
    console.error('Groq classify error:', err);
    return { umbrella: 'Leisure', type: 'Other' };
  }
}
