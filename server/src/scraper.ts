import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import type { Browser } from 'puppeteer-core';

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

  // 1. If the page has real product content markers, it is NOT a bot block,
  // even if the word "captcha" or other warning phrases appear on the page.
  const hasProductContent =
    lower.includes('application/ld+json') ||
    lower.includes('og:title') ||
    lower.includes('product:price') ||
    lower.includes('og:price');

  if (hasProductContent) {
    return false; // Real product page, not blocked
  }

  // 2. Only flag as blocked if there are clear bot-detection/WAF indicators
  return (
    lower.includes('robot check') ||
    lower.includes('api-services-support@amazon') ||
    lower.includes('sorry, we just need to make sure') ||
    lower.includes('type the characters you see') ||
    lower.includes('access denied') ||
    lower.includes('permission denied') ||
    lower.includes('cloudflare') ||
    lower.includes('cf-challenge') ||
    lower.includes('challenge-platform') ||
    lower.includes('just a moment...') ||
    lower.includes('attention required!') ||
    lower.includes('security check') ||
    lower.includes('robot-check') ||
    lower.includes('automated request') ||
    lower.includes('unusual activity') ||
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

      // If HTTP status is not 200, we treat it as blocked/failed
      if (response.status !== 200) {
        console.warn(`[Scraper] Non-200 status code (${response.status}) on attempt ${attempt + 1}`);
        lastError = new Error(`HTTP status ${response.status}`);
        continue;
      }

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
 * Launches a headless browser appropriate for the current environment.
 *
 * On Render (and other minimal Linux hosts without the system libraries
 * a normal Chromium install needs — libnss3, libatk-1.0, etc.), the full
 * `puppeteer` package's bundled Chromium fails to launch. We detect that
 * environment and use `puppeteer-core` + `@sparticuz/chromium`, a
 * self-contained Chromium build with no system-library dependencies.
 *
 * Locally (and anywhere else), we fall back to the full `puppeteer`
 * package, which is the easiest way to develop/debug with a real browser.
 */
async function getBrowser(): Promise<Browser> {
  const isRestrictedLinuxHost = !!process.env.RENDER || process.env.NODE_ENV === 'production';

  if (isRestrictedLinuxHost) {
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteerCore = await import('puppeteer-core');
    const executablePath = await chromium.executablePath();
    return puppeteerCore.launch({
      args: [
        ...chromium.args,
        '--disable-blink-features=AutomationControlled',
        '--window-size=1366,768',
      ],
      executablePath,
      headless: true,
    }) as unknown as Browser;
  }

  // Local development: use the full puppeteer package (devDependency) with
  // its own bundled Chromium so nothing extra needs to be installed.
  const puppeteer = (await import('puppeteer')).default;
  const localBrowser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1366,768',
    ],
  });
  return localBrowser as unknown as Browser;
}

/**
 * Fallback fetch using Puppeteer (real headless browser) to bypass basic WAFs/Cloudflare.
 */
async function fetchWithPuppeteer(targetUrl: string): Promise<string> {
  console.log(`[Scraper] Launching Puppeteer for robust fallback: ${targetUrl}`);

  let browser: Browser | undefined;
  try {
    browser = await getBrowser();

    const page = await browser.newPage();

    // Comprehensive Evasion Script to Spoof Real Browser
    await page.evaluateOnNewDocument(`
      // 1. Disable navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // 2. Spoof Languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en-IN', 'en']
      });

      // 3. Spoof Plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const pluginsList = [
            { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
          ];
          return pluginsList;
        }
      });

      // 4. Spoof window.chrome
      Object.defineProperty(window, 'chrome', {
        value: {
          app: {
            isInstalled: false,
            InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
            RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
          },
          runtime: {},
          loadTimes: () => {},
          csi: () => {}
        }
      });

      // 5. Spoof permissions query
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    `);

    // Spoof realistic User-Agent and Viewport
    await page.setUserAgent(getRandomUserAgent());
    await page.setViewport({ width: 1366, height: 768 });

    // Add realistic headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en-IN;q=0.9,en;q=0.8,hi;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Cache-Control': 'max-age=0'
    });

    // Attempt to navigate with a reasonable timeout
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

    // Optional: wait a moment for react/vue to hydrate
    await new Promise(r => setTimeout(r, 3000));

    const html = await page.content();
    return html;
  } finally {
    if (browser) {
      await browser.close().catch(() => { });
    }
  }
}

function isGenericTitle(title: string, url: string): boolean {
  const lower = title.toLowerCase().trim();
  const domain = (() => {
    try { return new URL(url).hostname.replace('www.', '').split('.')[0]; } catch (_) { return ''; }
  })();

  const genericPhrases = [
    'products',
    'product',
    'online shopping',
    'shopping cart',
    'cart',
    'checkout',
    'home page',
    'homepage',
    'log in',
    'login',
    'sign up',
    'signup',
    'welcome',
    'loading...',
    'loading',
    'please wait',
    '30,000+ products delivered',
    'ikea products',
    'meesho - online shopping',
    'meesho',
    'blinkit',
    'online store'
  ];

  if (genericPhrases.some(phrase => lower === phrase || lower.startsWith(phrase) || lower.endsWith(phrase))) {
    return true;
  }

  if (domain && lower === domain) {
    return true;
  }

  return false;
}

function parseProductDetails(html: string, targetUrl: string): ScrapedProduct {
  const $ = cheerio.load(html);

  let title = '';
  let price: number | null = null;
  let currency = 'USD';
  let imageUrl: string | null = null;
  let storeName = '';

  // 1. Try parsing JSON-LD schema
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const text = $(element).html();
      if (!text) return;
      const data = JSON.parse(text);

      // Traverse JSON-LD objects to find Product
      const findProduct = (obj: any): any => {
        if (!obj || typeof obj !== 'object') return null;
        if (obj['@type'] === 'Product' || obj['@type']?.includes?.('Product')) return obj;

        if (Array.isArray(obj)) {
          for (const item of obj) {
            const found = findProduct(item);
            if (found) return found;
          }
        } else {
          for (const key of Object.keys(obj)) {
            const found = findProduct(obj[key]);
            if (found) return found;
          }
        }
        return null;
      };

      const product = findProduct(data);
      if (product) {
        if (product.name && !title) {
          title = String(product.name);
        }

        // Image
        if (product.image && !imageUrl) {
          if (typeof product.image === 'string') {
            imageUrl = product.image;
          } else if (Array.isArray(product.image) && product.image.length) {
            imageUrl = String(product.image[0]);
          } else if (typeof product.image === 'object' && product.image.url) {
            imageUrl = String(product.image.url);
          }
        }

        // Price & Currency
        if (product.offers) {
          const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
          for (const offer of offers) {
            if (offer.price && price === null) {
              price = parseNumericPrice(String(offer.price));
            }
            if (offer.priceCurrency && currency === 'USD') {
              currency = String(offer.priceCurrency).trim().toUpperCase();
            }
          }
        }
      }
    } catch (_) {
      // Ignore JSON-LD parse errors
    }
  });

  // 2. Open Graph meta tags
  if (!title) {
    title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      '';
  }

  // 3. Fallback product title selectors
  if (!title || isGenericTitle(title, targetUrl)) {
    const titleSelectors = [
      'h1.product-title',
      'h1.product_title',
      'h1[class*="title" i]',
      'h1[id*="title" i]',
      'h1',
      '.product-name',
      '.product-title',
      'h2.product-title'
    ];
    for (const selector of titleSelectors) {
      const txt = $(selector).first().text().trim();
      if (txt && !isGenericTitle(txt, targetUrl)) {
        title = txt;
        break;
      }
    }
  }

  // Clean title
  if (title) {
    title = title
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const suffixPatterns = [
      /\s*\|\s*Flipkart\s*$/i,
      /\s*-\s*Flipkart\s*$/i,
      /\s*:\s*Amazon\.in\s*$/i,
      /\s*\|\s*Amazon\s*$/i,
      /\s*-\s*Amazon\s*$/i,
      /\s*\|\s*IKEA\s*$/i,
      /\s*-\s*IKEA\s*$/i,
      /\s*-\s*Meesho\s*$/i,
      /\s*\|\s*Blinkit\s*$/i
    ];
    for (const pattern of suffixPatterns) {
      title = title.replace(pattern, '');
    }
  }

  // Image URL
  if (!imageUrl) {
    imageUrl =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('link[rel="image_src"]').attr('href') || null;

    if (!imageUrl) {
      const amazonImg =
        $('#landingImage').attr('data-old-hires') ||
        $('#landingImage').attr('src') ||
        $('#imgBlkFront').attr('src') ||
        $('#ebooksImgBlkFront').attr('src') || null;
      if (amazonImg) {
        imageUrl = amazonImg;
      }
    }

    if (!imageUrl) {
      const altAmazon = $('#main-image').attr('src') || null;
      if (altAmazon) imageUrl = altAmazon;
    }

    if (!imageUrl) {
      const itempropImg = $('[itemprop="image"]').attr('src') || $('[itemprop="image"]').attr('content') || null;
      if (itempropImg) imageUrl = itempropImg;
    }

    if (!imageUrl) {
      const shopifyImg = $('.product-single__photo').attr('src') || $('.product-featured-img').attr('src') || null;
      if (shopifyImg) {
        imageUrl = shopifyImg;
      }
    }

    if (!imageUrl) {
      const flipkartImg = $('img._396cs4').first() || $('img._2r_T1I').first() || $('img._3togXc').first();
      if (flipkartImg.length) imageUrl = flipkartImg.attr('src') || null;
    }
  }

  if (imageUrl) imageUrl = resolveUrl(targetUrl, imageUrl);

  // Price fallback selectors
  if (price === null) {
    const rawPrice =
      $('meta[property="product:price:amount"]').attr('content') ||
      $('meta[property="og:price:amount"]').attr('content') ||
      $('meta[name="twitter:data1"]').attr('content');

    price = parseNumericPrice(rawPrice);

    if (price === null) {
      const label1 = $('meta[name="twitter:label1"]').attr('content');
      if (label1 && label1.toLowerCase().includes('price')) {
        const data1 = $('meta[name="twitter:data1"]').attr('content');
        price = parseNumericPrice(data1);
      }
    }
  }

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

  // Generic currency-symbol-based leaf node price fallback
  if (price === null) {
    const symbols = ['₹', 'rs.', '$', '£', '€'];
    for (const sym of symbols) {
      if (price !== null) break;

      const elements = $(`span:contains("${sym}"), h1:contains("${sym}"), h2:contains("${sym}"), h3:contains("${sym}"), h4:contains("${sym}"), h5:contains("${sym}"), p:contains("${sym}"), b:contains("${sym}"), div:contains("${sym}")`);

      elements.each((_, el) => {
        const isStrikeThrough =
          $(el).is('del, strike, s') ||
          $(el).parents('del, strike, s').length > 0 ||
          ($(el).attr('class') || '').toLowerCase().includes('strike') ||
          ($(el).attr('class') || '').toLowerCase().includes('original') ||
          ($(el).attr('class') || '').toLowerCase().includes('mrp');

        if (isStrikeThrough) {
          return;
        }

        const text = $(el).clone().children().remove().end().text().trim();
        if (text) {
          const val = parseNumericPrice(text);
          if (val !== null && val > 0 && val < 1000000) {
            price = val;
            return false;
          }
        }
      });
    }
  }

  // Currency
  const rawCurrency =
    $('meta[property="product:price:currency"]').attr('content') ||
    $('meta[property="og:price:currency"]').attr('content');
  if (rawCurrency) {
    currency = rawCurrency.trim().toUpperCase();
  } else {
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

  if (!storeName) {
    try {
      storeName = new URL(targetUrl).hostname.replace('www.', '');
    } catch (_) {
      storeName = 'Online Store';
    }
  }

  // Final sanitization of Image URL
  if (imageUrl) {
    imageUrl = imageUrl.trim();
    if (!isValidHttpUrl(imageUrl)) {
      imageUrl = null;
    }
  }

  return {
    title: title || 'Clipped Product',
    price,
    currency,
    imageUrl,
    sourceUrl: targetUrl,
    storeName,
  };
}

export async function scrapeProductUrl(targetUrl: string): Promise<ScrapedProduct> {
  if (!isValidHttpUrl(targetUrl)) {
    throw new Error('Invalid target URL. Only HTTP/HTTPS URLs are supported.');
  }

  let html: string;
  let parsedDetails: ScrapedProduct;

  try {
    html = await fetchWithRetry(targetUrl);
    parsedDetails = parseProductDetails(html, targetUrl);

    const isSkeleton =
      !parsedDetails.title ||
      parsedDetails.title === 'Clipped Product' ||
      isGenericTitle(parsedDetails.title, targetUrl) ||
      (parsedDetails.price === null && parsedDetails.imageUrl === null);

    if (isSkeleton) {
      throw new Error('Axios returned a generic skeleton page');
    }
  } catch (err: any) {
    console.warn(`[Scraper] Axios failed or returned skeleton for ${targetUrl}: ${err.message}. Attempting Puppeteer fallback...`);
    try {
      html = await fetchWithPuppeteer(targetUrl);
      if (isBotBlocked(html)) {
        throw new Error("Puppeteer was also blocked by bot detection");
      }
      parsedDetails = parseProductDetails(html, targetUrl);
    } catch (puppeteerErr: any) {
      console.error(`[Scraper] All fetch attempts (Axios + Puppeteer) failed for ${targetUrl}: ${puppeteerErr.message}`);
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
  }

  return parsedDetails;
}