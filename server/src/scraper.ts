import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';

export interface ScrapedProduct {
  title: string;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  sourceUrl: string;
  storeName: string;
}

/**
 * Validates if a URL string is a well-formed http or https link.
 */
function isValidHttpUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

/**
 * Resolves a relative URL against a base URL.
 */
function resolveUrl(base: string, relative: string): string {
  try {
    return new URL(relative, base).toString();
  } catch (_) {
    return relative;
  }
}

/**
 * Parses numeric price from a string (e.g. "$123.45" -> 123.45, "£9,99" -> 9.99).
 */
function parseNumericPrice(priceStr: string | null | undefined): number | null {
  if (!priceStr) return null;
  
  // Standardize the string: convert to string, lowercase, and trim
  let str = String(priceStr).trim().toLowerCase();
  
  // Reject ratings, discount percentages, reviews, etc.
  if (str.includes('out of') || str.includes('star') || str.includes('off') || str.includes('%') || str.includes('ratings') || str.includes('reviews')) {
    return null;
  }
  
  // Specifically strip Rupee and standard currency symbols/prefixes
  str = str.replace(/₹\s*|rs\.?\s*/gi, '');
  
  // Keep only digits, dots, and commas
  let cleaned = str.replace(/[^\d.,]/g, '');
  
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastDot > lastComma) {
      // Dot is decimal separator. Remove all commas.
      cleaned = cleaned.replace(/,/g, '');
    } else {
      // Comma is decimal separator. Remove all dots, then replace comma with dot.
      cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
    }
  } else if (lastComma !== -1) {
    // Only comma exists. Check if it's followed by exactly 3 digits at the end.
    const parts = cleaned.split(',');
    const lastPart = parts[parts.length - 1];
    if (lastPart.length === 3) {
      // Thousands separator. Remove it.
      cleaned = cleaned.replace(/,/g, '');
    } else {
      // Decimal separator. Replace with dot.
      cleaned = cleaned.replace(/,/g, '.');
    }
  }
  
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

/**
 * Detects currency code based on URL domain extension and page text search.
 */
function detectCurrencyFromTextAndUrl(html: string, url: string): string {
  const urlLower = url.toLowerCase();
  
  // High confidence domain checks
  if (urlLower.includes('.in') || urlLower.includes('flipkart.com') || urlLower.includes('amazon.in')) {
    return 'INR';
  }
  if (urlLower.includes('.uk') || urlLower.includes('.co.uk') || urlLower.includes('amazon.co.uk')) {
    return 'GBP';
  }
  if (urlLower.includes('.eu') || urlLower.includes('.de') || urlLower.includes('.fr') || urlLower.includes('.it') || urlLower.includes('.es') || urlLower.includes('amazon.de')) {
    return 'EUR';
  }
  if (urlLower.includes('.ca') || urlLower.includes('amazon.ca')) {
    return 'CAD';
  }
  if (urlLower.includes('.au') || urlLower.includes('amazon.com.au')) {
    return 'AUD';
  }

  // Scan html for currency symbols
  if (html.includes('₹') || html.includes('Rs.') || html.includes('INR')) {
    return 'INR';
  }
  if (html.includes('€') || html.includes('EUR')) {
    return 'EUR';
  }
  if (html.includes('£') || html.includes('GBP')) {
    return 'GBP';
  }
  if (html.includes('CDN$') || html.includes('CAD')) {
    return 'CAD';
  }
  if (html.includes('$') || html.includes('USD')) {
    return 'USD';
  }

  return 'USD'; // Default fallback
}

// --- Rotating User-Agent pool to avoid fingerprinting ---
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Checks if the fetched HTML is a bot-detection/captcha page rather than real content.
 */
function isBotBlocked(html: string): boolean {
  const lower = html.toLowerCase();
  
  // If the page has real product content markers, it's NOT a bot block,
  // even if the word "captcha" appears in JS bundles or cookie consent
  const hasProductContent = 
    lower.includes('application/ld+json') ||
    lower.includes('og:title') ||
    lower.includes('product:price') ||
    lower.includes('og:price');
  
  if (hasProductContent) {
    return false; // Real product page, not blocked
  }
  
  // Only flag as blocked if there are clear bot-detection indicators
  // AND no real product content
  return (
    lower.includes('robot check') ||
    lower.includes('api-services-support@amazon') ||
    lower.includes('sorry, we just need to make sure') ||
    lower.includes('type the characters you see') ||
    (lower.includes('captcha') && lower.includes('enter the characters')) ||
    (lower.includes('to discuss automated access') && lower.includes('amazon'))
  );
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches HTML from a URL with retry logic and bot-detection awareness.
 * Returns the HTML string or throws if all attempts fail.
 */
async function fetchWithRetry(targetUrl: string, maxRetries = 2): Promise<string> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Random delay between 1-3 seconds before retry
      const delay = 1000 + Math.random() * 2000;
      console.log(`[Scraper] Retry ${attempt}/${maxRetries} after ${Math.round(delay)}ms delay...`);
      await sleep(delay);
    }

    const ua = getRandomUserAgent();
    const headers: Record<string, string> = {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en-IN;q=0.9,en;q=0.8,hi;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
      'Connection': 'keep-alive',
    };

    // Add Chrome-specific headers only for Chrome UAs
    if (ua.includes('Chrome') && !ua.includes('Firefox') && !ua.includes('Safari/605')) {
      headers['Sec-Ch-Ua'] = '"Chromium";v="126", "Google Chrome";v="126", "Not/A)Brand";v="8"';
      headers['Sec-Ch-Ua-Mobile'] = '?0';
      headers['Sec-Ch-Ua-Platform'] = '"Windows"';
    }

    try {
      const response = await axios.get(targetUrl, {
        headers,
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: () => true,
        // Decompress response
        decompress: true,
      });

      const html = typeof response.data === 'string' ? response.data : String(response.data);

      // Check if we got blocked by bot detection
      if (isBotBlocked(html)) {
        console.warn(`[Scraper] Bot-blocked on attempt ${attempt + 1} for ${targetUrl}`);
        lastError = new Error('Bot detection triggered');
        continue; // Retry with different UA
      }

      // Check if we got an actual page with meaningful content (not an empty/minimal error page)
      if (html.length < 500) {
        console.warn(`[Scraper] Suspiciously short response (${html.length} chars) on attempt ${attempt + 1}`);
        lastError = new Error('Response too short');
        continue;
      }

      return html;
    } catch (err: any) {
      console.warn(`[Scraper] Request failed on attempt ${attempt + 1}: ${err.message}`);
      lastError = err;
      continue;
    }
  }

  // All retries exhausted — return whatever we last got, or throw
  throw lastError || new Error('All fetch attempts failed');
}

/**
 * Scrapes metadata and product details from a given URL.
 */
export async function scrapeProductUrl(targetUrl: string): Promise<ScrapedProduct> {
  if (!isValidHttpUrl(targetUrl)) {
    throw new Error('Invalid target URL. Only HTTP/HTTPS URLs are supported.');
  }

  let html: string;
  try {
    html = await fetchWithRetry(targetUrl);
  } catch (err: any) {
    console.error(`[Scraper] All fetch attempts failed for ${targetUrl}: ${err.message}`);
    // Return minimal fallback instead of throwing — the frontend can still show edit mode
    const hostname = (() => {
      try { return new URL(targetUrl).hostname.replace('www.', ''); } catch (_) { return 'Online Store'; }
    })();
    return {
      title: 'Could not load product',
      price: null,
      currency: detectCurrencyFromTextAndUrl('', targetUrl),
      imageUrl: null,
      sourceUrl: targetUrl,
      storeName: hostname,
    };
  }

  const $ = cheerio.load(html);

  let title = '';
  let price: number | null = null;
  let currency = 'USD';
  let imageUrl: string | null = null;
  let storeName = '';

  // 1. Try parsing JSON-LD schema (highly reliable for structured commerce data)
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const text = $(element).html();
      if (!text) return;
      const data = JSON.parse(text);
      
      // Traverse JSON-LD objects to find Product
      const findProduct = (obj: any): any => {
        if (!obj || typeof obj !== 'object') return null;
        if (obj['@type'] === 'Product') return obj;
        if (Array.isArray(obj)) {
          for (const item of obj) {
            const res = findProduct(item);
            if (res) return res;
          }
        }
        for (const key of Object.keys(obj)) {
          const res = findProduct(obj[key]);
          if (res) return res;
        }
        return null;
      };

      const product = findProduct(data);
      if (product) {
        if (product.name && !title) title = product.name;
        
        // Image parsing
        if (product.image) {
          let img = '';
          if (typeof product.image === 'string') {
            img = product.image;
          } else if (Array.isArray(product.image) && product.image.length > 0) {
            img = typeof product.image[0] === 'string' ? product.image[0] : product.image[0].url;
          } else if (typeof product.image === 'object' && product.image.url) {
            img = product.image.url;
          }
          if (img && !imageUrl) {
            imageUrl = resolveUrl(targetUrl, img);
          }
        }

         // Offers (Price) parsing
        if (product.offers) {
          const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
          for (const offer of offers) {
            if (offer.price !== undefined) {
              const val = parseNumericPrice(offer.price.toString());
              if (val !== null && price === null) {
                price = val;
              }
              if (offer.priceCurrency && !currency) {
                currency = offer.priceCurrency;
              }
            } else if (offer.lowPrice !== undefined) {
              const val = parseNumericPrice(offer.lowPrice.toString());
              if (val !== null && price === null) {
                price = val;
              }
              if (offer.priceCurrency && !currency) {
                currency = offer.priceCurrency;
              }
            }
          }
        }

        // Brand (Store Name) parsing
        if (product.brand) {
          const brandName = typeof product.brand === 'string' ? product.brand : product.brand.name;
          if (brandName && !storeName) {
            storeName = brandName;
          }
        }
      }
    } catch (_) {
      // Ignore JSON-LD syntax errors and look in other scripts
    }
  });

  // 2. Open Graph & Twitter fallbacks
  
  // Title
  if (!title) {
    title = 
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      '';
    title = title.trim();
  }

  // Strip common site-name suffixes from titles (e.g., "Product Name - Amazon.in" -> "Product Name")
  if (title) {
    title = title
      .replace(/\s*[-–|:]\s*(Amazon\.\w+|Flipkart\.com|Flipkart|Online Shopping|Buy Online).*$/i, '')
      .replace(/\s*[-–|:]\s*$/, '')
      .trim();
  }

  // --- IMAGE EXTRACTION ---
  
  // OG/Twitter image (works well for most sites including Amazon when served to real browsers)
  if (!imageUrl) {
    const ogImage = $('meta[property="og:image"]').attr('content') ||
                    $('meta[property="og:image:secure_url"]').attr('content') ||
                    $('meta[name="twitter:image"]').attr('content');
    if (ogImage) {
      imageUrl = resolveUrl(targetUrl, ogImage);
    }
  }

  // Amazon-specific image selectors
  if (!imageUrl) {
    // A. Check landingImage (standard Amazon product pages)
    const landingImage = $('#landingImage');
    if (landingImage.length) {
      const dynamicImageAttr = landingImage.attr('data-a-dynamic-image');
      if (dynamicImageAttr) {
        try {
          const imgs = JSON.parse(dynamicImageAttr);
          const urls = Object.keys(imgs);
          if (urls.length > 0) {
            imageUrl = urls[urls.length - 1]; // highest resolution
          }
        } catch (_) {}
      }
      if (!imageUrl) {
        imageUrl = landingImage.attr('src') || landingImage.attr('data-old-hires') || null;
      }
    }

    // B. Check book/kindle image cover
    if (!imageUrl) {
      const imgBlkFront = $('#imgBlkFront');
      if (imgBlkFront.length) {
        const dynamicImageAttr = imgBlkFront.attr('data-a-dynamic-image');
        if (dynamicImageAttr) {
          try {
            const imgs = JSON.parse(dynamicImageAttr);
            const urls = Object.keys(imgs);
            if (urls.length > 0) {
              imageUrl = urls[urls.length - 1];
            }
          } catch (_) {}
        }
        if (!imageUrl) {
          imageUrl = imgBlkFront.attr('src') || null;
        }
      }
    }

    // C. Check non-js fallback main image
    if (!imageUrl) {
      imageUrl = $('#main-image-non-js').attr('src') || null;
    }

    // D. Check generic main image container
    if (!imageUrl) {
      imageUrl = $('#main-image').attr('src') || null;
    }

    // E. Flipkart specific selectors
    if (!imageUrl) {
      const flipkartImg = $('img._396cs4') || $('img._2r_T1I') || $('img._3togXc');
      if (flipkartImg.length) {
        imageUrl = flipkartImg.attr('src') || null;
      }
    }

    // F. General page images (find large ones)
    if (!imageUrl) {
      $('img').each((_, el) => {
        const src = $(el).attr('src');
        const id = ($(el).attr('id') || '').toLowerCase();
        const cls = ($(el).attr('class') || '').toLowerCase();
        const alt = ($(el).attr('alt') || '').toLowerCase();
        
        if (src && (
          id.includes('prod') || id.includes('main') || cls.includes('front') || 
          id.includes('primary') || src.includes('/products/') || src.includes('/images/I/') ||
          src.includes('images.meesho.com') || alt.includes('product') || cls.includes('image')
        )) {
          imageUrl = src;
          return false; // Break
        }
      });
    }
  }

  if (imageUrl) {
    imageUrl = resolveUrl(targetUrl, imageUrl);
  }

  // Price
  if (price === null) {
    const rawPrice = 
      $('meta[property="product:price:amount"]').attr('content') ||
      $('meta[property="og:price:amount"]').attr('content') ||
      $('meta[name="twitter:data1"]').attr('content'); // Shopify uses twitter:label1 = "Price", twitter:data1 = "$100.00"
      
    price = parseNumericPrice(rawPrice);

    // If Twitter label is "Price", verify data1 value
    if (price === null) {
      const label1 = $('meta[name="twitter:label1"]').attr('content');
      if (label1 && label1.toLowerCase().includes('price')) {
        const data1 = $('meta[name="twitter:data1"]').attr('content');
        price = parseNumericPrice(data1);
      }
    }
  }

  // General e-commerce price selector fallbacks (e.g. Amazon offscreen price tags)
  if (price === null) {
    const priceSelectors = [
      '.priceToPay .a-offscreen',
      '.priceToPay',
      '.apexPriceToPay .a-offscreen',
      '.apexPriceToPay',
      '.a-price .a-offscreen',
      '.a-price-whole',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#price_inside_buybox',
      '#corePrice_feature_div .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-offscreen',
      '._30jeq3', // Flipkart current price
      '._16Jk6d', // Flipkart alternative price
      '.Nx9Z5j',  // Flipkart alternative price
      '.a-color-price',
      '#price',
      '[itemprop="price"]',
      '.price',
      '.product-price',
      'h4:contains("₹")',
      'h3:contains("₹")',
      'h2:contains("₹")',
      'h4',
      '[class*="price" i]',
      '[class*="Price" i]',
      'h3',
      '.Price__PriceText-sc-1oia0fb-0'
    ];
    for (const selector of priceSelectors) {
      const text = $(selector).first().text();
      if (text) {
        price = parseNumericPrice(text);
        if (price !== null) break;
      }
    }
  }

  // Currency
  const rawCurrency = 
    $('meta[property="product:price:currency"]').attr('content') ||
    $('meta[property="og:price:currency"]').attr('content');
  if (rawCurrency) {
    currency = rawCurrency.trim().toUpperCase();
  } else {
    // Dynamically detect currency based on URL context and page text
    currency = detectCurrencyFromTextAndUrl(html, targetUrl);
  }

  // Store Name
  if (!storeName) {
    storeName = 
      $('meta[property="og:site_name"]').attr('content') ||
      $('meta[name="twitter:site"]').attr('content') ||
      '';
    storeName = storeName.trim();
  }

  // Fallback store name from domain
  if (!storeName) {
    try {
      const parsedUrl = new URL(targetUrl);
      // Remove 'www.' and get domain name
      storeName = parsedUrl.hostname.replace('www.', '');
    } catch (_) {
      storeName = 'Online Store';
    }
  }

  // Final sanitization of Image URL (ensure http/https and reject scripts/data URIs)
  if (imageUrl) {
    imageUrl = imageUrl.trim();
    if (!isValidHttpUrl(imageUrl)) {
      imageUrl = null; // Reject javascript: or data: URIs
    }
  }

  // If we still don't have a title, fallback to something meaningful
  if (!title) {
    title = 'Clipped Product';
  }

  return {
    title,
    price,
    currency,
    imageUrl,
    sourceUrl: targetUrl,
    storeName,
  };
}
