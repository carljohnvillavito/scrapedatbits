const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const UserAgent = require('user-agents');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// --- ENVIRONMENT DETECTION ---
// Vercel usually has 'AWS_LAMBDA_FUNCTION_NAME' or 'VERCEL' env vars
const IS_VERCEL = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;

class ScraperEngine {
    constructor() {
        this.proxies = [
            'proxy.geonode.io:9000:geonode_ClRGNNvaJ5-type-residential:efacdaf9-3e64-4f8a-9004-368c7a51ad74'
        ];
    }

    getProxyConfig() {
        if (this.proxies.length === 0) return null;
        const rawProxy = this.proxies[Math.floor(Math.random() * this.proxies.length)];
        const parts = rawProxy.split(':');
        if (parts.length === 4) {
            return {
                host: parts[0],
                port: parseInt(parts[1]),
                auth: { username: parts[2], password: parts[3] },
                serverString: `${parts[0]}:${parts[1]}`
            };
        }
        return null;
    }

    getRandomUserAgent() {
        return new UserAgent({ deviceCategory: 'desktop' }).toString();
    }

    async randomSleep(min = 1000, max = 3000) {
        const delay = Math.floor(Math.random() * (max - min + 1) + min);
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    // --- STATIC ENGINE (Axios) ---
    async scrapeStatic(url) {
        console.log(`[🚀] Static (Axios): ${url}`);
        const userAgent = this.getRandomUserAgent();
        const proxyConfig = this.getProxyConfig();

        const options = {
            headers: { 'User-Agent': userAgent },
            timeout: 8000
        };

        if (proxyConfig) {
            options.proxy = {
                protocol: 'http',
                host: proxyConfig.host,
                port: proxyConfig.port,
                auth: proxyConfig.auth
            };
        }

        const response = await axios.get(url, options);
        return response.data;
    }

    // --- DYNAMIC ENGINE (Hybrid) ---
    async scrapeDynamic(url) {
        console.log(`[🤖] Dynamic Mode | Environment: ${IS_VERCEL ? 'Vercel (Light)' : 'Render/Local (Full)'}`);
        
        let browser;
        let page;
        const userAgent = this.getRandomUserAgent();
        const proxyConfig = this.getProxyConfig();

        if (IS_VERCEL) {
            // === VERCEL MODE (Lightweight, Manual Stealth) ===
            const chromium = require('@sparticuz/chromium');
            const puppeteerCore = require('puppeteer-core');

            // Use slightly older graphics mode for stability
            chromium.setGraphicsMode = false; 

            const launchArgs = [
                ...chromium.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled' // Essential manual stealth
            ];

            if (proxyConfig) launchArgs.push(`--proxy-server=${proxyConfig.serverString}`);

            browser = await puppeteerCore.launch({
                args: launchArgs,
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath(),
                headless: chromium.headless,
                ignoreHTTPSErrors: true
            });

        } else {
            // === RENDER / LOCAL MODE (Heavy, Full Plugin Support) ===
            const puppeteer = require('puppeteer-extra');
            const StealthPlugin = require('puppeteer-extra-plugin-stealth');
            puppeteer.use(StealthPlugin());

            const launchArgs = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1920,1080'
            ];

            if (proxyConfig) launchArgs.push(`--proxy-server=${proxyConfig.serverString}`);

            browser = await puppeteer.launch({
                headless: "new",
                args: launchArgs
            });
        }

        try {
            page = await browser.newPage();

            // Authenticate Proxy
            if (proxyConfig) await page.authenticate(proxyConfig.auth);

            // === MANUAL STEALTH INJECTION (For Vercel & Extra Safety) ===
            await page.setUserAgent(userAgent);
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
            
            // This hides the "I am a robot" flag manually
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });
            // ============================================================

            console.log(`[⏳] Navigating to ${url}...`);
            // Increased timeout for safety
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            // Human delay
            await this.randomSleep(1500, 3500);

            const content = await page.content();
            await browser.close();
            return content;

        } catch (error) {
            if (browser) await browser.close();
            throw error;
        }
    }
}

const engine = new ScraperEngine();

app.get('/api/scrape', async (req, res) => {
    let { site, mode } = req.query;

    if (!site) return res.status(400).send('Error: Missing "site" parameter.');
    if (!/^https?:\/\//i.test(site)) site = 'https://' + site;

    // Force dynamic for your specific target
    const useDynamic = mode === 'dynamic' || site.includes('siits.store');

    try {
        let htmlData;
        if (useDynamic) {
            htmlData = await engine.scrapeDynamic(site);
        } else {
            try {
                htmlData = await engine.scrapeStatic(site);
            } catch (e) {
                console.log(`[⚠️] Static failed (${e.message}), switching to Dynamic...`);
                htmlData = await engine.scrapeDynamic(site);
            }
        }

        const $ = cheerio.load(htmlData);
        res.setHeader('Content-Type', 'text/plain');
        res.send($.html());

    } catch (error) {
        console.error(`[❌] Error: ${error.message}`);
        res.status(500).send(`Scrape Failed: ${error.message}`);
    }
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`⚡ Scraper running on http://localhost:${PORT}`);
        console.log(`📝 Environment: ${IS_VERCEL ? 'Vercel Mode' : 'Standard Mode'}`);
    });
}

module.exports = app;
