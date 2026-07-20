import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { prisma } from './db';
import { scrapeProductUrl } from './scraper';
import { classifyProduct } from './classifier';
import { extractCanonicalKey } from './canonical';
import { scrapeQueue, setupRecurringJobs } from './queue';
import { extractFromScreenshot } from './vision';
import './workers';

// Multer: in-memory storage, 4 MB limit, images only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (ALLOWED.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are accepted (JPEG, PNG, WebP, GIF).'));
    }
  },
});

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS setup - allow dynamic localhost ports and client URL
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    // Allow any localhost or 127.0.0.1 port for developer setup
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    // Allow production CLIENT_URL if defined
    if (process.env.CLIENT_URL) {
      const cleanOrigin = origin.replace(/\/$/, '');
      const cleanClientUrl = process.env.CLIENT_URL.replace(/\/$/, '');
      if (cleanClientUrl === '*' || cleanOrigin === cleanClientUrl) {
        return callback(null, true);
      }
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());

// Enforce security headers for defense-in-depth protection
app.use((req: Request, res: Response, next: NextFunction) => {
  // Content Security Policy (CSP)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: http:; connect-src 'self' *;"
  );
  // Prevent MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Prevent Clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // HTTP Strict Transport Security (HSTS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// HTML Escaping utility to prevent XSS
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Custom request interface with session identity
export interface AuthenticatedRequest extends Request {
  anonIdentity?: {
    id: string;
    sessionToken: string;
  };
}

// Lightweight in-memory rate limiter to protect write and scrape endpoints
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function rateLimiter(limit: number, windowMs: number) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Rate limit by anon identity ID or client IP
    const key = req.anonIdentity?.id || req.ip || 'global';
    const now = Date.now();
    const record = rateLimitMap.get(key);

    if (!record || now > record.resetTime) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    record.count++;
    if (record.count > limit) {
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
      });
    }

    next();
  };
}

// Specific rate limit instances
const scrapeLimiter = rateLimiter(15, 60 * 1000);       // Max 15 scrapes per minute
const writeLimiter = rateLimiter(60, 60 * 1000);        // Max 60 writes per minute
const screenshotLimiter = rateLimiter(5, 60 * 1000);   // Max 5 screenshot analyses per minute (vision API cost)

// Middleware to establish silent anonymous session token
async function sessionMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    let token = req.headers['x-session-token'] as string;
    
    // Parse cookie if header is not present
    if (!token && req.headers.cookie) {
      const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
        const [key, val] = cookie.trim().split('=');
        acc[key] = val;
        return acc;
      }, {} as Record<string, string>);
      token = cookies['giftgrid_session'];
    }

    let identity = null;

    if (token) {
      // Find existing identity
      identity = await prisma.anonIdentity.findUnique({
        where: { sessionToken: token },
      });
    }

    if (!identity) {
      // Create new anonymous identity
      const newToken = uuidv4();
      identity = await prisma.anonIdentity.create({
        data: { sessionToken: newToken },
      });

      // Set cookie for 10 years
      res.cookie('giftgrid_session', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 10 * 365 * 24 * 60 * 60 * 1000, // 10 years
      });

      // Also set header for the client to read if needed
      res.setHeader('X-Session-Token', newToken);
    }

    req.anonIdentity = {
      id: identity.id,
      sessionToken: identity.sessionToken,
    };
    next();
  } catch (error) {
    next(error);
  }
}

// Apply session middleware to all /api/v1/ routes except shared view
app.use('/api/v1', (req: Request, res: Response, next: NextFunction) => {
  // Public shared links do not require session middleware, but we run it anyway to see if owner is logged in
  sessionMiddleware(req as AuthenticatedRequest, res, next);
});

// --- AUTH & SESSION ENDPOINTS ---

// Check active session status
app.get('/api/v1/auth/session', (req: AuthenticatedRequest, res: Response) => {
  res.json({
    userId: req.anonIdentity?.id,
    sessionToken: req.anonIdentity?.sessionToken,
  });
});

// --- SCRAPER PREVIEW ENDPOINT ---

// Scrapes a target URL and returns product metadata for preview/editing
app.post('/api/v1/scrape', scrapeLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A valid url parameter is required.' });
  }

  // Normalize URL format (prepend https:// if protocol is missing)
  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    const product = await scrapeProductUrl(targetUrl);

    // Classify product in parallel — but never let it block or crash the response
    let classification = { umbrella: 'Leisure', type: 'Other' };
    try {
      classification = await classifyProduct(product.title, product.storeName, product.sourceUrl);
    } catch (classifyErr: any) {
      console.warn('[Scrape] Classification failed, using defaults:', classifyErr.message);
    }
    
    res.json({
      ...product,
      umbrellaTag: classification.umbrella,
      typeTag: classification.type,
    });
  } catch (error: any) {
    console.error('[Scrape] Endpoint error:', error.message);
    res.status(422).json({
      error: 'Failed to scrape metadata from URL.',
      details: error.message || error,
    });
  }
});

// --- BOARDS ENDPOINTS ---

// Fetch all boards belonging to the current anonymous user
app.get('/api/v1/boards', async (req: AuthenticatedRequest, res: Response) => {
  const ownerId = req.anonIdentity?.id;

  try {
    const boards = await prisma.board.findMany({
      where: { ownerId },
      include: {
        clips: {
          include: {
            claim: true, // We can see claims for our own boards in management view, but wait: the plan says:
            // "Server-side query-level exclusion ensures a board owner's authenticated request can never receive claim-status fields for their own board"
            // Wait, does the owner see claim status in the board management list? No! "gift coordination depends entirely on people trusting both guarantees."
            // "enforces owner-blind claim privacy so creators are never spoiled on what has been bought."
            // So we MUST NOT include claims here either!
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Remove claim details to prevent spoiling the owner
    const sanitizedBoards = boards.map(board => ({
      ...board,
      clips: board.clips.map(clip => {
        const { claim, ...clipData } = clip;
        return clipData;
      }),
    }));

    res.json(sanitizedBoards);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve boards.' });
  }
});

// Create a new board
app.post('/api/v1/boards', async (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.body;
  const ownerId = req.anonIdentity?.id;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Board name is required.' });
  }

  if (!ownerId) {
    return res.status(401).json({ error: 'Session not established.' });
  }

  try {
    const board = await prisma.board.create({
      data: {
        name: escapeHtml(name.trim()),
        ownerId,
        shareToken: uuidv4(),
      },
    });
    res.status(201).json(board);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create board.' });
  }
});

// Regenerate or revoke a board's share token
app.post('/api/v1/boards/:id/share', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const ownerId = req.anonIdentity?.id;
  const { revoke } = req.body;

  try {
    const board = await prisma.board.findFirst({
      where: { id, ownerId },
    });

    if (!board) {
      return res.status(404).json({ error: 'Board not found or unauthorized.' });
    }

    const updatedBoard = await prisma.board.update({
      where: { id },
      data: {
        shareToken: revoke ? uuidv4() : uuidv4(), // Regenerate or revoke (always generate new unguessable UUID)
      },
    });

    res.json({ shareToken: updatedBoard.shareToken });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update share link.' });
  }
});

// Generate or revoke a full-profile share token
app.post('/api/v1/profile/share', async (req: AuthenticatedRequest, res: Response) => {
  const ownerId = req.anonIdentity?.id;
  const { revoke } = req.body;

  if (!ownerId) {
    return res.status(401).json({ error: 'Session not established.' });
  }

  try {
    if (revoke) {
      await prisma.profileShare.deleteMany({
        where: { ownerId },
      });
      return res.json({ message: 'Profile sharing revoked.' });
    }

    const share = await prisma.profileShare.upsert({
      where: { ownerId },
      update: { shareToken: uuidv4() },
      create: {
        ownerId,
        shareToken: uuidv4(),
      },
    });

    res.json({ shareToken: share.shareToken });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile share link.' });
  }
});

// Fetch user's current profile share token status
app.get('/api/v1/profile/share', async (req: AuthenticatedRequest, res: Response) => {
  const ownerId = req.anonIdentity?.id;

  if (!ownerId) {
    return res.status(401).json({ error: 'Session not established.' });
  }

  try {
    const share = await prisma.profileShare.findUnique({
      where: { ownerId },
    });
    res.json(share || { shareToken: null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile share status.' });
  }
});

// --- CLIPS ENDPOINTS ---

// Fetch all clips belonging to the current anonymous user
app.get('/api/v1/clips', async (req: AuthenticatedRequest, res: Response) => {
  const ownerId = req.anonIdentity?.id;

  if (!ownerId) {
    return res.status(401).json({ error: 'Session not established.' });
  }

  try {
    const clips = await prisma.clip.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(clips);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve clips.' });
  }
});

// Screenshot-Assisted Fallback: Upload screenshot → Groq Vision → returns pre-fill data (does NOT save clip)
app.post(
  '/api/v1/clips/screenshot-fallback',
  screenshotLimiter,
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    upload.single('screenshot')(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Image too large. Maximum allowed size is 4 MB.' });
      }
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  async (req: AuthenticatedRequest, res: Response) => {
    const ownerId = req.anonIdentity?.id;
    if (!ownerId) return res.status(401).json({ error: 'Session not established.' });

    if (!req.file) {
      return res.status(400).json({ error: 'No screenshot uploaded. Include a file field named "screenshot".' });
    }

    try {
      const imageBase64 = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;

      const result = await extractFromScreenshot(imageBase64, mimeType);

      // Also include the screenshot as a data URL so the client can display it as the clip image
      const screenshotDataUrl = `data:${mimeType};base64,${imageBase64}`;

      return res.status(200).json({
        ...result,
        screenshotDataUrl,
      });
    } catch (err: any) {
      console.error('[ScreenshotFallback] Groq vision error:', err.message);
      return res.status(502).json({ error: 'Vision extraction failed. Please try entering details manually.' });
    }
  }
);

// Create a new clip
app.post('/api/v1/clips', async (req: AuthenticatedRequest, res: Response) => {
  const { boardId, url, forceAdd, title, price, currency, imageUrl, sourceUrl, storeName, umbrellaTag, typeTag, source } = req.body;
  const ownerId = req.anonIdentity?.id;

  const targetUrl = url || sourceUrl;

  if (!targetUrl) {
    return res.status(400).json({ error: 'url or sourceUrl is required.' });
  }

  if (!ownerId) {
    return res.status(401).json({ error: 'Session not established.' });
  }

  try {
    let canonicalKey = extractCanonicalKey(targetUrl);

    // Verify board ownership if boardId is provided
    if (boardId) {
      const board = await prisma.board.findFirst({
        where: { id: boardId, ownerId },
      });

      if (!board) {
        return res.status(403).json({ error: 'Unauthorized to add to this board.' });
      }

      if (!forceAdd) {
        const existingClip = await prisma.clip.findFirst({
          where: { boardId, canonicalKey }
        });
        
        if (existingClip) {
          return res.status(409).json({
            duplicate: true,
            existingClip: { id: existingClip.id, title: existingClip.title, createdAt: existingClip.createdAt },
            message: 'You already have this item in this board.'
          });
        }
      }
    }

    if (!title) {
      const clip = await prisma.clip.create({
        data: {
          boardId: boardId || null,
          ownerId,
          title: 'Processing...',
          price: null,
          currency: 'USD',
          sourceUrl: targetUrl,
          storeName: 'Online Store',
          umbrellaTag: 'Leisure',
          typeTag: 'Other',
          canonicalKey,
          status: 'PENDING'
        },
      });

      await scrapeQueue.add('scrape-clip', { url: targetUrl, clipId: clip.id });
      
      return res.status(202).json(clip);
    }

    const clip = await prisma.clip.create({
      data: {
        boardId: boardId || null,
        ownerId,
        title: escapeHtml(title.trim()),
        price: price ? parseFloat(price) : null,
        currency: currency ? escapeHtml(currency.trim()) : 'USD',
        imageUrl: imageUrl ? imageUrl.trim() : null,
        sourceUrl: targetUrl.trim(),
        storeName: storeName ? escapeHtml(storeName.trim()) : 'Online Store',
        umbrellaTag: umbrellaTag ? escapeHtml(umbrellaTag.trim()) : 'Leisure',
        typeTag: typeTag ? escapeHtml(typeTag.trim()) : 'Other',
        canonicalKey,
        status: 'SUCCESS',
        source: ['auto', 'manual', 'screenshot_ai'].includes(source) ? source : 'auto',
      },
    });

    if (clip.price !== null) {
      await prisma.priceHistory.create({
        data: {
          clipId: clip.id,
          price: clip.price,
          currency: clip.currency
        }
      });
    }

    res.status(201).json(clip);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create clip.' });
  }
});

// Get clip status
app.get('/api/v1/clips/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const ownerId = req.anonIdentity?.id;

  try {
    const clip = await prisma.clip.findUnique({
      where: { id }
    });
    
    if (!clip || clip.ownerId !== ownerId) {
      return res.status(404).json({ error: 'Clip not found.' });
    }

    res.json({ status: clip.status, clip });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get clip status.' });
  }
});

// Update an existing clip
app.put('/api/v1/clips/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { title, price, currency, imageUrl, boardId, umbrellaTag, typeTag } = req.body;
  const ownerId = req.anonIdentity?.id;

  try {
    // Verify clip owner
    const clip = await prisma.clip.findUnique({
      where: { id },
    });

    if (!clip || clip.ownerId !== ownerId) {
      return res.status(404).json({ error: 'Clip not found or unauthorized.' });
    }

    // If changing board, verify new board ownership
    if (boardId && boardId !== clip.boardId) {
      const newBoard = await prisma.board.findFirst({
        where: { id: boardId, ownerId },
      });
      if (!newBoard) {
        return res.status(403).json({ error: 'Unauthorized to move clip to this board.' });
      }
    }

    const updatedClip = await prisma.clip.update({
      where: { id },
      data: {
        title: title ? escapeHtml(title.trim()) : undefined,
        price: price !== undefined ? (price ? parseFloat(price) : null) : undefined,
        currency: currency ? escapeHtml(currency.trim()) : undefined,
        imageUrl: imageUrl !== undefined ? (imageUrl ? imageUrl.trim() : null) : undefined,
        boardId: boardId || undefined,
        umbrellaTag: umbrellaTag ? escapeHtml(umbrellaTag.trim()) : undefined,
        typeTag: typeTag ? escapeHtml(typeTag.trim()) : undefined,
      },
    });

    res.json(updatedClip);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update clip.' });
  }
});

// Delete a clip
app.delete('/api/v1/clips/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const ownerId = req.anonIdentity?.id;

  try {
    const clip = await prisma.clip.findUnique({
      where: { id },
    });

    if (!clip || clip.ownerId !== ownerId) {
      return res.status(404).json({ error: 'Clip not found or unauthorized.' });
    }

    await prisma.clip.delete({
      where: { id },
    });

    res.json({ message: 'Clip deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete clip.' });
  }
});

// --- PUBLIC SHARING ENDPOINTS (OWNER-BLIND) ---

// Public view for shared boards and profiles
app.get('/api/v1/b/:shareToken', async (req: AuthenticatedRequest, res: Response) => {
  const { shareToken } = req.params;
  const currentUserId = req.anonIdentity?.id;

  try {
    // 1. Try single board share token
    const board = await prisma.board.findUnique({
      where: { shareToken },
      include: {
        owner: true,
        clips: {
          include: {
            claim: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (board) {
      const isOwner = currentUserId === board.ownerId;
      
      // Enforce owner-blind exclusion: strip claims for owner
      const sanitizedClips = board.clips.map(clip => {
        const { claim, ...clipData } = clip;
        if (isOwner) {
          // Owner is NOT allowed to see claim info
          return {
            ...clipData,
            claimed: false, // Mask status to prevent cheating
          };
        } else {
          // Guests can see if claimed
          return {
            ...clipData,
            claimed: !!claim,
            guestLabel: claim?.guestLabel || null,
          };
        }
      });

      return res.json({
        type: 'board',
        id: board.id,
        name: board.name,
        isOwner,
        clips: sanitizedClips,
      });
    }

    // 2. Try full profile share token
    const profileShare = await prisma.profileShare.findUnique({
      where: { shareToken },
      include: {
        owner: {
          include: {
            boards: {
              include: {
                clips: {
                  include: {
                    claim: true,
                  },
                  orderBy: { createdAt: 'desc' },
                },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (profileShare && (!profileShare.revokedAt)) {
      const isOwner = currentUserId === profileShare.ownerId;
      
      const sanitizedBoards = profileShare.owner.boards.map(b => {
        const sanitizedClips = b.clips.map(clip => {
          const { claim, ...clipData } = clip;
          if (isOwner) {
            return {
              ...clipData,
              claimed: false,
            };
          } else {
            return {
              ...clipData,
              claimed: !!claim,
              guestLabel: claim?.guestLabel || null,
            };
          }
        });

        return {
          id: b.id,
          name: b.name,
          clips: sanitizedClips,
        };
      });

      return res.json({
        type: 'profile',
        isOwner,
        boards: sanitizedBoards,
      });
    }

    return res.status(404).json({ error: 'Shared board or profile not found.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load public page.' });
  }
});

// --- CLAIM ACTION ENDPOINT ---

// Claim a product (by a guest)
app.post('/api/v1/clips/:id/claim', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { guestLabel } = req.body;
  const currentUserId = req.anonIdentity?.id;

  try {
    const clip = await prisma.clip.findUnique({
      where: { id },
      include: {
        claim: true,
      },
    });

    if (!clip) {
      return res.status(404).json({ error: 'Clip not found.' });
    }

    // Check if the claimant is actually the owner of the clip
    if (clip.ownerId === currentUserId) {
      return res.status(400).json({ error: 'You cannot claim items on your own wishlist!' });
    }

    // Check if already claimed
    if (clip.claim) {
      return res.status(409).json({ error: 'This item has already been claimed by someone else.' });
    }

    // Perform claim
    const claim = await prisma.claim.create({
      data: {
        clipId: id,
        guestLabel: guestLabel ? escapeHtml(guestLabel.trim()) : null,
      },
    });

    res.status(201).json({
      success: true,
      claimedAt: claim.claimedAt,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to claim product.' });
  }
});

// Unclaim a product (in case a guest clicked by mistake)
app.post('/api/v1/clips/:id/unclaim', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const claim = await prisma.claim.findUnique({
      where: { clipId: id },
    });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found or item not claimed.' });
    }

    await prisma.claim.delete({
      where: { clipId: id },
    });

    res.json({ success: true, message: 'Item unclaimed successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unclaim product.' });
  }
});

// --- CATEGORY SEARCH ENDPOINT ---

// Fetch the 10 most recently added clips across all boards (or uncategorized)
app.get('/api/v1/clips/recent', async (req: AuthenticatedRequest, res: Response) => {
  const ownerId = req.anonIdentity?.id;
  try {
    const clips = await prisma.clip.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    res.json(clips);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve recent clips.' });
  }
});

// Retrieve all user's clips matching a specific category across boards
app.get('/api/v1/categories/:umbrella/:type?', async (req: AuthenticatedRequest, res: Response) => {
  const ownerId = req.anonIdentity?.id;
  const { umbrella, type } = req.params;

  try {
    const whereClause: any = {
      umbrellaTag: umbrella,
      ownerId,
    };
    
    if (type) {
      whereClause.typeTag = type;
    }

    const clips = await prisma.clip.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    res.json(clips);
  } catch (error) {
    res.status(500).json({ error: 'Failed to filter by category.' });
  }
});

// --- SEARCH ENDPOINT ---

// Unified search across own clips and boards
app.get('/api/v1/search', async (req: AuthenticatedRequest, res: Response) => {
  const ownerId = req.anonIdentity?.id;
  const query = req.query.q as string;

  if (!query) {
    return res.json({ clips: [], boards: [] });
  }

  try {
    const matchingBoards = await prisma.board.findMany({
      where: {
        ownerId,
        name: {
          contains: query,
        },
      },
      include: {
        _count: {
          select: { clips: true },
        },
      },
    });

    const matchingClips = await prisma.clip.findMany({
      where: {
        ownerId,
        OR: [
          { title: { contains: query } },
          { storeName: { contains: query } },
          { umbrellaTag: { contains: query } },
          { typeTag: { contains: query } },
          {
            board: {
              name: { contains: query }
            }
          }
        ],
      },
      include: {
        board: true,
      },
    });

    res.json({
      boards: matchingBoards,
      clips: matchingClips,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute search query.' });
  }
});

// --- NOTIFICATIONS ENDPOINTS ---

app.get('/api/v1/notifications', async (req: AuthenticatedRequest, res: Response) => {
  const ownerId = req.anonIdentity?.id;
  if (!ownerId) return res.status(401).json({ error: 'Session not established.' });

  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: ownerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get notifications.' });
  }
});

app.patch('/api/v1/notifications/:id/read', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const ownerId = req.anonIdentity?.id;
  if (!ownerId) return res.status(401).json({ error: 'Session not established.' });

  try {
    const notification = await prisma.notification.findFirst({
      where: { id, userId: ownerId }
    });

    if (!notification) return res.status(404).json({ error: 'Notification not found.' });

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification read.' });
  }
});

// Start backend server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
    console.log(`[GiftGrid Server] Running on http://localhost:${PORT}`);
    try {
      await setupRecurringJobs();
      console.log('[GiftGrid Server] Recurring background jobs scheduled.');
    } catch (e) {
      console.error('[GiftGrid Server] Failed to setup recurring jobs:', e);
    }
  });
}

export { app };

