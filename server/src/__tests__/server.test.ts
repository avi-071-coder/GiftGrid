import request from 'supertest';
import { app } from '../server';
import { prisma } from '../db';

// Mock the Prisma DB client
jest.mock('../db', () => ({
  prisma: {
    anonIdentity: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    board: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    clip: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    claim: {
      create: jest.fn(),
    },
    profileShare: {
      findUnique: jest.fn(),
    },
  },
}));

describe('GiftGrid Backend API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('XSS Prevention', () => {
    it('should escape HTML inputs when creating a board', async () => {
      const mockSessionToken = 'test-session-token';
      const mockUserId = 'user-123';
      const mockBoardName = '<script>alert("hack")</script> Birthday Registry';
      const expectedEscapedName = '&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt; Birthday Registry';

      // Mock session lookup
      (prisma.anonIdentity.findUnique as jest.Mock).mockResolvedValue({
        id: mockUserId,
        sessionToken: mockSessionToken,
      });

      // Mock board creation
      (prisma.board.create as jest.Mock).mockResolvedValue({
        id: 'board-123',
        name: expectedEscapedName,
        ownerId: mockUserId,
        shareToken: 'share-token-123',
      });

      const response = await request(app)
        .post('/api/v1/boards')
        .set('x-session-token', mockSessionToken)
        .send({ name: mockBoardName });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe(expectedEscapedName);
      expect(prisma.board.create).toHaveBeenCalledWith({
        data: {
          name: expectedEscapedName,
          ownerId: mockUserId,
          shareToken: expect.any(String),
        },
      });
    });
  });

  describe('Claim Privacy (Owner-Blind Exclusion)', () => {
    const mockBoard = {
      id: 'board-123',
      name: 'Wedding Wishlist',
      ownerId: 'owner-user-id',
      shareToken: 'board-share-token',
      clips: [
        {
          id: 'clip-1',
          title: 'Espresso Machine',
          price: 299.99,
          currency: 'USD',
          sourceUrl: 'https://store.com/espresso',
          storeName: 'CoffeeStore',
          umbrellaTag: 'Household',
          typeTag: 'Kitchenware',
          claim: {
            id: 'claim-1',
            clipId: 'clip-1',
            guestLabel: 'Uncle Bob',
          },
        },
        {
          id: 'clip-2',
          title: 'Leather Boots',
          price: 150.00,
          currency: 'USD',
          sourceUrl: 'https://store.com/boots',
          storeName: 'BootStore',
          umbrellaTag: 'Outfits',
          typeTag: 'Footwear',
          claim: null,
        },
      ],
    };

    it('should NOT show claim details to the board owner', async () => {
      const mockSessionToken = 'owner-session-token';

      // Mock session lookup returning the owner's identity
      (prisma.anonIdentity.findUnique as jest.Mock).mockResolvedValue({
        id: 'owner-user-id',
        sessionToken: mockSessionToken,
      });

      // Mock board lookup
      (prisma.board.findUnique as jest.Mock).mockResolvedValue(mockBoard);

      const response = await request(app)
        .get('/api/v1/b/board-share-token')
        .set('x-session-token', mockSessionToken);

      expect(response.status).toBe(200);
      expect(response.body.type).toBe('board');
      expect(response.body.isOwner).toBe(true);

      // Verify that claim details are masked / removed
      expect(response.body.clips[0].claimed).toBe(false);
      expect(response.body.clips[0].guestLabel).toBeUndefined();
      expect(response.body.clips[0].claim).toBeUndefined();

      expect(response.body.clips[1].claimed).toBe(false);
    });

    it('should show claim status to a guest (unauthenticated or non-owner)', async () => {
      const mockSessionToken = 'guest-session-token';

      // Mock session lookup returning a guest identity
      (prisma.anonIdentity.findUnique as jest.Mock).mockResolvedValue({
        id: 'guest-user-id',
        sessionToken: mockSessionToken,
      });

      // Mock board lookup
      (prisma.board.findUnique as jest.Mock).mockResolvedValue(mockBoard);

      const response = await request(app)
        .get('/api/v1/b/board-share-token')
        .set('x-session-token', mockSessionToken);

      expect(response.status).toBe(200);
      expect(response.body.type).toBe('board');
      expect(response.body.isOwner).toBe(false);

      // Verify that claim details are visible to guests
      expect(response.body.clips[0].claimed).toBe(true);
      expect(response.body.clips[0].guestLabel).toBe('Uncle Bob');
      expect(response.body.clips[0].claim).toBeUndefined(); // raw DB join is still stripped

      expect(response.body.clips[1].claimed).toBe(false);
      expect(response.body.clips[1].guestLabel).toBeNull();
    });
  });
});
