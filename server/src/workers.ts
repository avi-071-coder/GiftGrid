import { Worker, Job } from 'bullmq';
import { redisConnection, priceCheckQueue, useBullMQ } from './queue';
import { prisma } from './db';
import { scrapeProductUrl } from './scraper';
import { classifyProduct } from './classifier';

export async function handleScrapeJob(job: Job) {
  const { url, clipId } = job.data;
  
  try {
    const product = await scrapeProductUrl(url);
    
    let classification = { umbrella: 'Leisure', type: 'Other' };
    try {
      classification = await classifyProduct(product.title, product.storeName, product.sourceUrl);
    } catch (err: any) {
      console.warn('[Worker] Classification failed, using defaults:', err.message);
    }

    // Update clip with real data and set status to SUCCESS
    await prisma.clip.update({
      where: { id: clipId },
      data: {
        title: product.title,
        price: product.price,
        currency: product.currency,
        imageUrl: product.imageUrl,
        storeName: product.storeName,
        umbrellaTag: classification.umbrella,
        typeTag: classification.type,
        status: 'SUCCESS'
      }
    });

    // Also insert first PriceHistory if price is available
    if (product.price !== null) {
      await prisma.priceHistory.create({
        data: {
          clipId,
          price: product.price,
          currency: product.currency,
        }
      });
    }

  } catch (error: any) {
    console.error(`[Worker] Scrape job failed for clip ${clipId}:`, error.message);
    await prisma.clip.update({
      where: { id: clipId },
      data: { status: 'FAILED' }
    });
    throw error;
  }
}

export async function handlePriceCheckJob(job: Job) {
  if (job.name === 'price-check-master') {
    // The master job enqueues individual checks for all active clips
    const activeClips = await prisma.clip.findMany({
      where: { status: 'SUCCESS' }
    });

    let delay = 0;
    for (const clip of activeClips) {
      await priceCheckQueue.add(
        'price-check-clip',
        { clipId: clip.id, url: clip.sourceUrl },
        { delay }
      );
      // Stagger jobs by 2 seconds to avoid hitting rate limits
      delay += 2000 + Math.random() * 2000;
    }
  } else if (job.name === 'price-check-clip') {
    const { clipId, url } = job.data;
    const clip = await prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip) return;

    try {
      const product = await scrapeProductUrl(url);
      
      if (product.price !== null) {
        // Get last known price
        const lastHistory = await prisma.priceHistory.findFirst({
          where: { clipId: clip.id },
          orderBy: { capturedAt: 'desc' }
        });

        const lastPrice = lastHistory ? lastHistory.price : clip.price;

        if (lastPrice !== product.price) {
          // Price changed
          await prisma.priceHistory.create({
            data: {
              clipId: clip.id,
              price: product.price,
              currency: product.currency,
            }
          });

          await prisma.clip.update({
            where: { id: clip.id },
            data: { price: product.price, currency: product.currency }
          });

          // Create notification
          let type = 'price_drop';
          if (lastPrice && product.price > lastPrice) {
            type = 'price_increase';
          }
          await prisma.notification.create({
            data: {
              userId: clip.ownerId,
              clipId: clip.id,
              type,
              oldPrice: lastPrice,
              newPrice: product.price,
            }
          });
        }
      }
    } catch (err: any) {
      console.warn(`[PriceCheck] Failed to check price for clip ${clipId}: ${err.message}`);
    }
  }
}

export let scrapeWorker: Worker | null = null;
export let priceCheckWorker: Worker | null = null;

if (useBullMQ && redisConnection) {
  scrapeWorker = new Worker('scrape-queue', handleScrapeJob, { connection: redisConnection, concurrency: 3 });
  priceCheckWorker = new Worker('price-check-queue', handlePriceCheckJob, { connection: redisConnection, concurrency: 1 });
}

