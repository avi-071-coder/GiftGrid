# GiftGrid - E-Commerce Product Clip & Wishlist Engine

GiftGrid is a wishlist aggregation product that allows users to clip products from any online e-commerce platform and organize them into boards. By pasting a product URL, the backend extracts product metadata (title, price, currency, image, and category) to build an interactive personal shopping catalog.

---

## 1. Product Features

* **Multi-Store Product Clipping:** Automatically extracts product details (title, price, currency, and main product image) from URLs across diverse e-commerce platforms (Amazon, Flipkart, Etsy, Barnes & Noble, LEGO, and more).
* **Semantic Product Classification:** Automatically classifies products into logical tags (e.g., *Outfits* ➔ *Clothing*, *Electronics* ➔ *Phones & Tablets*) using semantic AI classification based on the product metadata.
* **Smart Currency Standardization:** Detects regional domains and formats, automatically converting and mapping prices to correct local currencies (INR for Indian e-commerce, USD as default global fallback).
* **Fault-Tolerant Scraping Fallback:** When a site strictly blocks automated traffic (e.g., Instagram behind login screens, geofenced platforms like Zepto/Blinkit), the application automatically opens a manual edit flow. This ensures users can still save any product by typing details manually.
* **Wishlist & Board Management:** Users can organize their clips into multiple distinct wishlist boards, search across clips, and share collections with others.

---

## 2. Issues Encountered & Solutions

### A. Protocol-less URL Crashes
* **The Issue:** Copy-pasting raw domains without `http://` or `https://` (e.g., pasting `amazon.in/product-name` directly) caused the parser to fail when extracting hostnames and threw errors in the backend validator.
* **The Solution:** Added a normalization layer to both the frontend and backend. The application now checks the URL pattern and prepends `https://` if missing. Hostnames are safely resolved, enabling clean store name extraction and successful HTTP scraping.

### B. E-Commerce Scraper Blocks & Captcha False-Positives
* **The Issue:** Major platforms like Amazon returned `404 Page Not Found` or captcha blocks when queried by the backend scraper, and the scraper's captcha detection falsely flagged pages like Flipkart.
* **The Solution:** 
  1. Configured rotating browser user-agent profiles mimicking desktop and mobile Chrome/Safari instances.
  2. Revised the bot-detection algorithm to only flag captcha pages when no product metadata could be extracted, preventing false positives.

### C. Stalling Classification Pipeline
* **The Issue:** When semantic AI classification endpoints lagged, the entire scrape request hung, keeping the user stuck on a loading screen.
* **The Solution:** Integrated a strict 5-second timeout on the classification fetch. If the AI tagging service takes too long, the system falls back to default tags instantly without blocking the product metadata payload.

---

## 3. Technology Stack & Architecture

### Backend (`/server`)
* **Express & Node.js:** High-performance REST API.
* **Cheerio & Axios:** Lightweight HTML scraper extracting schema structures (JSON-LD) and fallback meta tags (OpenGraph / Twitter Cards).
* **Prisma & Database:** PostgreSQL schema mapping board and clip relationships.
* **Groq SDK:** Semantic product categorization logic.

### Frontend (`/client`)
* **Vite, React & TypeScript:** Quick-loading client bundle.
* **TailwindCSS:** Layout styling framework.

---

## 4. Setup & Running Instructions

### Backend Setup
1. Navigate to the server folder:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure the environment variables in a `.env` file:
   ```env
   PORT=3001
   DATABASE_URL="postgresql://user:password@localhost:5432/giftgrid"
   GROQ_API_KEY="your_groq_api_key_here"
   ```
4. Run migrations to initialize the database:
   ```bash
   npx prisma migrate dev
   ```
5. Start the development server:
   ```bash
   npm run dev
   ```

### Frontend Setup
1. Navigate to the client folder:
   ```bash
   cd ../client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## 5. Security Controls

* **Indirect Object Reference (IDOR) Protection:** All database operations (retrieval, creation, updates, and deletion of boards and clips) are strictly scoped by the authenticated anonymous user's `ownerId` parsed from the server-validated session cookie/header. Users cannot query or mutate data belonging to other sessions by submitting alternative IDs.
* **Cryptographically Secure Session Tokens:** Session UUIDs are generated using the `uuid` package (`uuidv4()`), which relies on the Node/browser crypto API (CSPRNG). This prevents predictability and session hijacking.
* **Defense-in-Depth HTTP Security Headers:** Express is configured to send key HTTP security headers on all requests:
  * `Content-Security-Policy (CSP)`: Directs the browser to restrict script and style sources, preventing execution of injected payloads.
  * `X-Content-Type-Options: nosniff`: Prevents MIME-type sniffing vulnerabilities.
  * `X-Frame-Options: DENY`: Blocks clickjacking attacks.
  * `Referrer-Policy: strict-origin-when-cross-origin`: Controls referrer data leakage.
  * `Strict-Transport-Security (HSTS)`: Restricts connections to HTTPS in production environments.
* **Write & Scrape Endpoint Rate Limiting:** An in-memory rate limiter safeguards write operations (limit: 60/min) and scraping execution (limit: 15/min) per anonymous user ID or IP, preventing scraping abuse and spam submissions.
* **SQL Injection Prevention:** Uses Prisma ORM, which executes queries via pre-compiled parameterized statements rather than constructing raw SQL queries.
* **Secrets Management:** Critical credentials (like database URLs and the Groq API key) are kept in local `.env` files and loaded via environments, avoiding hardcoded values in version control.
