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

// Enable Stealth Mode
puppeteer.use(StealthPlugin());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// --- THE SCRAPER ENGINE CLASS ---
class ScraperEngine {
    constructor() {
        // 1. FIXED: Added quotes around the string
        // 2. NOTE: This supports format "host:port:username:password"
        this.proxies = [
            'proxy.geonode.io:9000:geonode_ClRGNNvaJ5-type-residential:efacdaf9-3e64-4f8a-9004-368c7a51ad74'
        ]; 
    }

    // Helper: Parse "host:port:user:pass" into a usable object
    getProxyConfig() {
        if (this.proxies.length === 0) return null;
        
        // Pick random proxy
        const rawProxy = this.proxies[Math.floor(Math.random() * this.proxies.length)];
        const parts = rawProxy.split(':');

        // Check if format is host:port:user:pass
        if (parts.length === 4) {
            return {
                host: parts[0],
                port: parseInt(parts[1]),
                auth: {
                    username: parts[2],
                    password: parts[3]
                },
                // For Puppeteer string format
                serverString: `${parts[0]}:${parts[1]}` 
            };
        }
        return null;
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
        const proxyConfig = this.getProxyConfig();

        console.log(`[🚀] Mode: Static (Axios) | Target: ${url}`);
        
        // Axios Config
        const axiosOptions = {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.google.com/'
            },
            timeout: 10000
        };

        // Apply Proxy if available
        if (proxyConfig) {
            console.log(`[🛡️] Using Proxy: ${proxyConfig.host}`);
            axiosOptions.proxy = {
                protocol: 'http',
                host: proxyConfig.host,
                port: proxyConfig.port,
                auth: proxyConfig.auth
            };
        }

        const response = await axios.get(url, axiosOptions);
        return response.data;
    }

    // METHOD 2: Heavy Dynamic Scraping (Puppeteer)
    async scrapeDynamic(url) {
        const userAgent = this.getRandomUserAgent();
        const proxyConfig = this.getProxyConfig();

        console.log(`[🤖] Mode: Dynamic (Puppeteer) | Target: ${url}`);

        const launchArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1920,1080'
        ];

        // Apply Proxy Argument
        if (proxyConfig) {
            launchArgs.push(`--proxy-server=${proxyConfig.serverString}`);
        }

        const browser = await puppeteer.launch({
            headless: "new",
            args: launchArgs
        });

        try {
            const page = await browser.newPage();
            
            // Apply Proxy Auth (Username/Password)
            if (proxyConfig) {
                await page.authenticate(proxyConfig.auth);
            }

            await page.setUserAgent(userAgent);
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

            console.log(`[⏳] Navigating...`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

            await this.randomSleep(1000, 2500);

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

    if (!/^https?:\/\//i.test(site)) site = 'https://' + site;

    const knownToughSites = ['facebook.com', 'instagram.com', 'twitter.com', 'tiktok.com', 'linkedin.com'];
    const isTough = knownToughSites.some(domain => site.includes(domain));
    const useDynamic = mode === 'dynamic' || isTough;

    try {
        let htmlData;

        if (useDynamic) {
            htmlData = await engine.scrapeDynamic(site);
        } else {
            try {
                htmlData = await engine.scrapeStatic(site);
            } catch (staticErr) {
                console.log(`[⚠️] Static failed (${staticErr.message}), switching to Dynamic...`);
                htmlData = await engine.scrapeDynamic(site);
            }
        }

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
