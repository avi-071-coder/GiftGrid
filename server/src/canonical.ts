import { URL } from 'url';

export function extractCanonicalKey(urlString: string): string {
  try {
    const url = new URL(urlString);
    let hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    let pathname = url.pathname.replace(/\/$/, '');

    // Vendor-specific extraction
    if (hostname.includes('amazon.')) {
      const match = pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
      if (match) return `amazon:${match[1]}`;
    }

    if (hostname.includes('flipkart.com')) {
      const pid = url.searchParams.get('pid');
      if (pid) return `flipkart:${pid}`;
    }

    if (hostname.includes('etsy.com')) {
      const match = pathname.match(/\/listing\/(\d+)/i);
      if (match) return `etsy:${match[1]}`;
    }

    if (hostname.includes('lego.com')) {
      const match = pathname.match(/-(\d+)$/i);
      if (match) return `lego:${match[1]}`;
    }

    // Default URL normalization
    const paramsToKeep = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!lowerKey.startsWith('utm_') && !['ref', 'tag', 'affid', 'gclid', 'fbclid', 'session'].includes(lowerKey)) {
        paramsToKeep.append(key, value);
      }
    });

    const query = paramsToKeep.toString();
    return `${hostname}${pathname}${query ? '?' + query : ''}`;
  } catch (err) {
    return urlString;
  }
}
