import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export interface IQueue {
  add(name: string, data: any, opts?: any): Promise<any>;
}

export let scrapeQueue: IQueue;
export let priceCheckQueue: IQueue;
export let redisConnection: IORedis | null = null;
export let useBullMQ = false;

if (process.env.REDIS_URL) {
  try {
    redisConnection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    scrapeQueue = new Queue('scrape-queue', { connection: redisConnection });
    priceCheckQueue = new Queue('price-check-queue', { connection: redisConnection });
    useBullMQ = true;
    console.log('[Queue] BullMQ active with remote Redis.');
  } catch (e: any) {
    console.error('[Queue] Failed to initialize BullMQ:', e.message);
  }
}

if (!useBullMQ) {
  console.log('[Queue] REDIS_URL not set or connection failed. Using in-memory fallback for local development (Redis v5+ required for BullMQ).');
  
  scrapeQueue = {
    async add(name, data, opts) {
      setTimeout(() => {
        const { handleScrapeJob } = require('./workers');
        handleScrapeJob({ data, name } as any).catch(console.error);
      }, opts?.delay || 0);
    }
  };

  priceCheckQueue = {
    async add(name, data, opts) {
      setTimeout(() => {
        const { handlePriceCheckJob } = require('./workers');
        handlePriceCheckJob({ data, name } as any).catch(console.error);
      }, opts?.delay || 0);
    }
  };
}

export async function setupRecurringJobs() {
  if (useBullMQ && priceCheckQueue instanceof Queue) {
    await priceCheckQueue.add(
      'price-check-master',
      {},
      {
        repeat: {
          pattern: '0 */6 * * *',
        },
      }
    );
  } else {
    // In-memory fallback
    setTimeout(() => {
      priceCheckQueue.add('price-check-master', {});
    }, 10000); // 10s after start for testing
    
    setInterval(() => {
      priceCheckQueue.add('price-check-master', {});
    }, 6 * 60 * 60 * 1000);
  }
}

