import { scrapeProductUrl } from '../scraper';
import { classifyProduct } from '../classifier';

// A curated list of diverse retail and indie product links for validation
const TEST_URLS = [
  {
    name: 'Uncommon Goods (Indie / Gifts)',
    url: 'https://www.uncommongoods.com/product/scratch-map-deluxe'
  },
  {
    name: 'IKEA (Household / Furniture)',
    url: 'https://www.ikea.com/us/en/p/fado-table-lamp-with-led-bulb-white-90525904/'
  },
  {
    name: 'Barnes & Noble (Books)',
    url: 'https://www.barnesandnoble.com/w/the-hobbyist-garrett-m-petersen/1144078864'
  },
  {
    name: 'Etsy Custom Leather Bookmark (Indie / Marketplace)',
    url: 'https://www.etsy.com/listing/1344400585/custom-leather-bookmark-personalized'
  },
  {
    name: 'Patagonia (Clothing / Outdoors)',
    url: 'https://www.patagonia.com/product/mens-torrentshell-3l-rain-jacket/85241.html'
  },
  {
    name: 'Best Buy (Electronics)',
    url: 'https://www.bestbuy.com/site/apple-airtag-4-pack-silver/6461940.p'
  },
  {
    name: 'Target (Retail)',
    url: 'https://www.target.com/p/nintendo-switch-oled-model-with-white-joy-con/-/A-83885301'
  },
  {
    name: 'Nordstrom (Clothing / Accessories)',
    url: 'https://www.nordstrom.com/s/vans-classic-slip-on-sneaker-unisex/3133346'
  },
  {
    name: 'Saks Fifth Avenue (Luxury)',
    url: 'https://www.saksfifthavenue.com/product/prada-pr-17ws-49mm-sunglasses-0400014389658.html'
  },
  {
    name: 'Lego Store (Toys)',
    url: 'https://www.lego.com/en-us/product/nasa-apollo-11-lunar-lander-10266'
  }
];

async function runTests() {
  console.log('==================================================');
  console.log('STARTING GIFTGRID SCRAPER ENGINE VALIDATION RUN');
  console.log(`Testing scraper against ${TEST_URLS.length} diverse e-commerce sites...`);
  console.log('==================================================\n');

  let successCount = 0;
  let blockedCount = 0;

  for (let i = 0; i < TEST_URLS.length; i++) {
    const item = TEST_URLS[i];
    console.log(`[Test ${i + 1}/${TEST_URLS.length}] Running: ${item.name}`);
    console.log(`URL: ${item.url}`);
    
    try {
      const start = Date.now();
      const product = await scrapeProductUrl(item.url);
      const duration = Date.now() - start;

      const category = await classifyProduct(product.title, product.storeName, product.sourceUrl);

      console.log(`  Result: SUCCESS (took ${duration}ms)`);
      console.log(`  ├─ Title:     "${product.title}"`);
      console.log(`  ├─ Price:     ${product.price !== null ? `${product.currency} ${product.price}` : 'Not Scraped (Fallback to edit)'}`);
      console.log(`  ├─ Store:     "${product.storeName}"`);
      console.log(`  ├─ Category:  [${category.umbrella} ➔ ${category.type}]`);
      console.log(`  └─ Image URL: ${product.imageUrl ? product.imageUrl.substring(0, 80) + '...' : 'None'}`);
      
      successCount++;
    } catch (err: any) {
      console.log(`  Result: BLOCKED / FAILED`);
      console.log(`  └─ Error details: ${err.message || err}`);
      blockedCount++;
    }
    console.log('--------------------------------------------------\n');
  }

  console.log('==================================================');
  console.log('SCRAPER VALIDATION COMPLETED');
  console.log(`Total Run: ${TEST_URLS.length}`);
  console.log(`Successful Scrapes: ${successCount}`);
  console.log(`Blocked/Failed (Graceful Fallback): ${blockedCount}`);
  console.log(`Success Rate: ${((successCount / TEST_URLS.length) * 100).toFixed(1)}%`);
  console.log('==================================================');
}

runTests();
