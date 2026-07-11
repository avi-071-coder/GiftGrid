# GiftGrid - E-Commerce Product Clip & Wishlist Engine

GiftGrid is a wishlist aggregation engine that focuses on core backend features and reliable product metadata extraction. By providing a product URL, the system effortlessly processes, classifies, and organizes items into personalized boards.

---

## 1. Core Features

* **Multi-Store Product Clipping Engine:** A robust extraction pipeline that automatically pulls critical product details (title, price, currency, and main product image) from URLs across diverse e-commerce platforms including Amazon, Flipkart, Etsy, Barnes & Noble, LEGO, and more.
* **Semantic AI Product Classification:** Automatically classifies and tags products into logical categories (e.g., *Outfits* ➔ *Clothing*, *Electronics* ➔ *Phones & Tablets*) leveraging advanced semantic AI classification on the extracted product metadata.
* **Smart Currency Standardization:** Dynamically detects regional domains and formats, automatically converting and mapping prices to correct local currencies (INR for Indian e-commerce, USD as default global fallback).
* **Fault-Tolerant Scraping Fallback:** When a site strictly blocks automated traffic (e.g., Instagram behind login screens, geofenced platforms), the system seamlessly falls back to a manual input flow, ensuring no data is ever lost.
* **Wishlist & Board Management APIs:** Comprehensive backend support allowing users to organize clips into distinct wishlist boards, perform cross-clip searches, and manage their collections efficiently.

---

## 2. Issues Encountered & Solutions

### A. Protocol-less URL Normalization
* **The Issue:** Raw domains without `http://` or `https://` caused parsing failures.
* **The Solution:** Added a strict normalization layer to prepend `https://` safely and resolve hostnames, ensuring clean extraction and HTTP scraping.

### B. E-Commerce Scraper Blocks & Captcha Resiliency
* **The Issue:** Scraper blocks and captcha false-positives on major platforms. 
  
---

## 3. Technology Stack & Architecture

### Backend (`/server`)
* **Express & Node.js:** High-performance REST API.
* **Cheerio & Axios:** Lightweight HTML scraper for JSON-LD and OpenGraph tags.
* **Prisma & Database:** PostgreSQL schema mapping.
* **Groq SDK:** Semantic product categorization logic.

### Frontend (`/client`)
* **Vite, React & TypeScript:** Functional client implementation.

---

## 4. Setup & Running Instructions

### Backend Setup
1. `cd server`
2. `npm install`
3. Configure `.env`:
   ```env
   PORT=3001
   DATABASE_URL="postgresql://user:password@localhost:5432/giftgrid"
   GROQ_API_KEY="your_groq_api_key_here"
   ```
4. `npx prisma migrate dev`
5. `npm run dev`

### Frontend Setup
1. `cd ../client`
2. `npm install`
3. `npm run dev`

---

## 5. Security Controls

* **IDOR Protection:** All database operations are strictly scoped by authenticated `ownerId`.
* **Cryptographically Secure Session Tokens:** Unpredictable UUIDs generated via CSPRNG.
* **HTTP Security Headers:** Implements CSP, nosniff, DENY frame options, strict referrer policies, and HSTS.
* **Rate Limiting:** Protects write and scrape endpoints against abuse and spam.
* **SQL Injection Prevention:** Uses Prisma ORM parameterized statements.
* **Secrets Management:** Credentials secured in local `.env` files.
