const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserAgent = require('user-agents');

// --- CONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 3000;

// Enable Stealth Mode (Bypasses "I am a robot" checks)
puppeteer.use(StealthPlugin());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// --- THE SCRAPER ENGINE CLASS ---
class ScraperEngine {
    constructor() {
        // Add your proxies here if you have them. Format: "http://user:pass@ip:port"
        this.proxies = [https://proxy.geonode.io:9000:geonode_ClRGNNvaJ5-type-residential:efacdaf9-3e64-4f8a-9004-368c7a51ad74]; 
    }

    async randomSleep(min = 1000, max = 3000) {
        const delay = Math.floor(Math.random() * (max - min + 1) + min);
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    getRandomUserAgent() {
        return new UserAgent({ deviceCategory: 'desktop' }).toString();
    }

    // METHOD 1: Fast Static Scraping (Axios)
    async scrapeStatic(url) {
        const userAgent = this.getRandomUserAgent();
        console.log(`[🚀] Mode: Static (Axios) | Target: ${url}`);

        const response = await axios.get(url, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.google.com/'
            },
            timeout: 10000 // 10s timeout
        });

        return response.data;
    }

    // METHOD 2: Heavy Dynamic Scraping (Puppeteer)
    async scrapeDynamic(url) {
        const userAgent = this.getRandomUserAgent();
        console.log(`[🤖] Mode: Dynamic (Puppeteer) | Target: ${url}`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1920,1080'
            ]
        });

        try {
            const page = await browser.newPage();
            
            // Apply Stealth settings
            await page.setUserAgent(userAgent);
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

            // Navigate
            console.log(`[⏳] Navigating...`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

            // Random Human Delay
            await this.randomSleep(1000, 2500);

            // Extract HTML
            const content = await page.content();
            
            await browser.close();
            return content;

        } catch (error) {
            await browser.close();
            throw error;
        }
    }
}

// Initialize Engine
const engine = new ScraperEngine();

// --- API ENDPOINT ---
app.get('/api/scrape', async (req, res) => {
    let { site, mode } = req.query;

    if (!site) return res.status(400).send('Error: Missing "site" parameter.');

    // URL formatting
    if (!/^https?:\/\//i.test(site)) site = 'https://' + site;

    // Logic: Default to Static. If user asks for 'dynamic' OR it's a known tough site, switch.
    const knownToughSites = ['facebook.com', 'instagram.com', 'twitter.com', 'tiktok.com', 'linkedin.com'];
    const isTough = knownToughSites.some(domain => site.includes(domain));
    
    // Determine Mode (Static is default, Dynamic if requested or tough site)
    const useDynamic = mode === 'dynamic' || isTough;

    try {
        let htmlData;

        if (useDynamic) {
            htmlData = await engine.scrapeDynamic(site);
        } else {
            // Try Static first
            try {
                htmlData = await engine.scrapeStatic(site);
            } catch (staticErr) {
                console.log(`[⚠️] Static failed (${staticErr.message}), switching to Dynamic...`);
                // Fallback to Dynamic if Static fails (e.g. Cloudflare 403)
                htmlData = await engine.scrapeDynamic(site);
            }
        }

        // Clean up output (Optional - prettify)
        const $ = cheerio.load(htmlData);
        const finalHtml = $.html();

        res.setHeader('Content-Type', 'text/plain');
        res.send(finalHtml);

    } catch (error) {
        console.error(`[❌] Scrape Error: ${error.message}`);
        res.status(500).send(`Failed to scrape ${site}\n\nError: ${error.message}`);
    }
});

// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`⚡ Ultimate Scraper running on http://localhost:${PORT}`);
    });
}

module.exports = app;
