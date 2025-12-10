const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserAgent = require('user-agents');

// Enable Stealth Mode (Bypasses Cloudflare/Anti-bot checks)
puppeteer.use(StealthPlugin());

class UltimateScraper {
    constructor(config = {}) {
        this.proxies = config.proxies || []; // ["http://user:pass@ip:port", ...]
        this.minDelay = config.minDelay || 2000; // 2 seconds
        this.maxDelay = config.maxDelay || 5000; // 5 seconds
    }

    /**
     * CORE: Returns a random delay to mimic human behavior
     */
    async randomSleep() {
        const delay = Math.floor(Math.random() * (this.maxDelay - this.minDelay + 1) + this.minDelay);
        console.log(`[⏳] Sleeping for ${delay}ms...`);
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * CORE: Rotates User-Agents and Proxies
     */
    getSessionConfig() {
        const userAgent = new UserAgent({ deviceCategory: 'desktop' }).toString();
        const proxy = this.proxies.length > 0 
            ? this.proxies[Math.floor(Math.random() * this.proxies.length)] 
            : null;

        return { userAgent, proxy };
    }

    /**
     * ENGINE 1: FAST (Static Pages)
     * Uses Axios. Good for Wikipedia, Blogs, simple HTML sites.
     */
    async scrapeStatic(url) {
        const { userAgent, proxy } = this.getSessionConfig();
        console.log(`[🚀] Static Scraping: ${url}`);
        
        // Note: Axios proxy config requires an httpsAgent if using proxies
        // For simplicity, we are setting headers here.
        
        try {
            await this.randomSleep();
            
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': userAgent,
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                },
                // proxy: proxy ? { ...parsedProxy } : false // Axios proxy logic would go here
            });

            const $ = cheerio.load(response.data);
            return {
                type: 'static',
                status: response.status,
                title: $('title').text().trim(),
                html: $.html().substring(0, 500) + '...' // Truncated for preview
            };

        } catch (error) {
            console.error(`[❌] Static Failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * ENGINE 2: HEAVY (JS-Heavy Pages)
     * Uses Puppeteer + Stealth. Good for Facebook, Instagram, SPAs.
     */
    async scrapeDynamic(url) {
        const { userAgent, proxy } = this.getSessionConfig();
        console.log(`[🤖] Dynamic Scraping (Puppeteer): ${url}`);
        console.log(`[🎭] User-Agent: ${userAgent}`);

        const browserArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1920,1080',
        ];

        if (proxy) {
            browserArgs.push(`--proxy-server=${proxy}`);
        }

        const browser = await puppeteer.launch({
            headless: "new", // Set to false if you want to see the browser open
            args: browserArgs
        });

        try {
            const page = await browser.newPage();
            
            // 1. Set Realistic Headers
            await page.setUserAgent(userAgent);
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
            });

            // 2. Random Mouse Movements (Anti-Bot Evasion)
            // (Simulated logic would go here)

            // 3. Navigate with delays
            await this.randomSleep();
            
            // waitUntil: 'networkidle2' means wait until network activity slows down
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

            // 4. Extract Data
            const content = await page.content();
            const title = await page.title();

            await browser.close();

            return {
                type: 'dynamic',
                status: 200,
                title: title,
                html: content.substring(0, 500) + '...'
            };

        } catch (error) {
            await browser.close();
            console.error(`[❌] Dynamic Failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * MAIN CONTROLLER
     * Decides which engine to use
     */
    async scrape(url, forceDynamic = false) {
        if (forceDynamic) {
            return await this.scrapeDynamic(url);
        } else {
            // Try static first, if it fails or looks empty, you could fallback to dynamic
            try {
                return await this.scrapeStatic(url);
            } catch (e) {
                console.log("[⚠️] Static failed, switching to Dynamic Engine...");
                return await this.scrapeDynamic(url);
            }
        }
    }
}

// --- EXPORT ---
module.exports = UltimateScraper;
