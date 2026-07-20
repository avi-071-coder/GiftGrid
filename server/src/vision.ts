import Groq from 'groq-sdk';

export interface VisionResult {
  title: string | null;
  price: number | null;
  currency: string | null;
  confidence: 'high' | 'medium' | 'low';
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You extract structured product information from a screenshot of an e-commerce product page.
Read the visible title, current price, and currency from the image.
If a price appears struck through/crossed out next to another price, the current price is the one NOT struck through.
If multiple prices are visible (e.g. price ranges, per-unit pricing), choose the primary displayed price for the product as shown.

Respond ONLY with JSON, no other text, in this exact shape:
{
  "title": string | null,
  "price": number | null,
  "currency": string | null,
  "confidence": "high" | "medium" | "low"
}
If a field isn't clearly visible in the image, return null for it rather than guessing.`;

export async function extractFromScreenshot(imageBase64: string, mimeType: string): Promise<VisionResult> {
  const response = await groq.chat.completions.create({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
            },
          },
          {
            type: 'text',
            text: 'Extract the product title, price, and currency from this screenshot.',
          },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 256,
  });

  const raw = response.choices[0]?.message?.content?.trim() || '';

  // Strip any markdown fences if model wraps response
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      title: typeof parsed.title === 'string' ? parsed.title : null,
      price: typeof parsed.price === 'number' ? parsed.price : null,
      currency: typeof parsed.currency === 'string' ? parsed.currency.toUpperCase() : null,
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
    };
  } catch {
    // JSON parse failed — return nulls with low confidence
    console.error('[Vision] Failed to parse Groq response:', raw);
    return { title: null, price: null, currency: null, confidence: 'low' };
  }
}
