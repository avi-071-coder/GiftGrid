# GiftGrid - E-Commerce Product Clip & Wishlist Engine

GiftGrid is a wishlist aggregation engine that focuses on core backend features and reliable product metadata extraction. By providing a product URL, the system effortlessly processes, classifies, and organizes items into personalized boards using background queues and semantic AI.

---

## 1. Core Features

| Feature | Infrastructure | Description |
| :--- | :--- | :--- |
| **Background Scraping** | BullMQ & Redis | Clips are extracted asynchronously, preventing API timeouts and enabling reliable fallback handling for slow sites. |
| **Duplicate Prevention** | Canonical URLs | Strips affiliate and tracking parameters to generate a unique key (e.g. Amazon ASINs) to prevent duplicate board entries. |
| **Price Tracking Alerts** | BullMQ Cron | Periodically re-checks product prices every 6 hours and logs price history. Generates notifications for price drops. |
| **Semantic AI Tagging** | Groq SDK (LLMs) | Automatically classifies and tags products into logical categories (e.g., *Outfits* ➔ *Clothing*). |
| **Currency Standardization** | Regex Mapping | Dynamically detects regional domains and formats, converting prices to correct local currencies (INR, USD, etc). |

---

## 2. System Architecture

GiftGrid utilizes an event-driven background processing architecture to handle unreliable external scraping requests without blocking the main API thread.

```mermaid
flowchart TB
    Client[Client / Browser] -->|POST /api/v1/clips| API[Express API Server]
    API -.->|202 Accepted| Client
    
    subgraph Backend Services
        direction TB
        API -->|Enqueue 'PENDING'| RedisQueue[(Redis Queues)]
        
        RedisQueue -->|Consume| ScrapeWorker[Scrape Worker]
        ScrapeWorker -->|HTTP Request| Vendor[E-Commerce Sites]
        ScrapeWorker -->|Classify| Groq[Groq AI]
        ScrapeWorker -->|Update 'SUCCESS'| DB[(PostgreSQL)]
        
        Cron[Master Cron Job] -->|Trigger 6h| PriceQueue[(Price Queue)]
        PriceQueue -->|Consume| PriceWorker[Price Worker]
        PriceWorker -->|Re-fetch Price| Vendor
        PriceWorker -->|Update PriceHistory| DB
    end
```

---

## 3. Technology Stack

### Backend (`/server`)
* **Express & Node.js:** High-performance REST API.
* **BullMQ & ioredis:** Robust background job queues for scraping and scheduled tasks.
* **Cheerio & Axios:** Lightweight HTML scraper for JSON-LD and OpenGraph tags.
* **Prisma & PostgreSQL:** Database schema mapping and persistent storage.
* **Groq SDK:** Semantic product categorization logic.

### Frontend (`/client`)
* **Vite, React & TypeScript:** Functional client implementation.

---

## 4. Security Controls

* **IDOR Protection:** All database operations are strictly scoped by authenticated `ownerId`.
* **Cryptographically Secure Session Tokens:** Unpredictable UUIDs generated via CSPRNG.
* **HTTP Security Headers:** Implements CSP, nosniff, DENY frame options, strict referrer policies, and HSTS.
* **Rate Limiting:** Protects write and scrape endpoints against abuse and spam.
* **SQL Injection Prevention:** Uses Prisma ORM parameterized statements.
* **Secrets Management:** Credentials secured in local `.env` files.

---

## 5. Setup & Running Instructions

### Backend Setup
1. `cd server`
2. `npm install`
3. Configure `.env`:
   ```env
   PORT=3001
   DATABASE_URL="postgresql://user:password@localhost:5432/giftgrid"
   GROQ_API_KEY="your_groq_api_key_here"
   REDIS_URL="redis://localhost:6379"
   ```
4. `npx prisma migrate dev`
5. `npm run dev`

### Frontend Setup
1. `cd ../client`
2. `npm install`
3. `npm run dev`
