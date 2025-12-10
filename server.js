const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

// 1. Core Puppeteer & Chromium (For Vercel)
const chromium = require('@sparticuz/chromium');
const puppeteerCore = require('puppeteer-core');
const { addExtra } = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserAgent = require('user-agents');

// 2. THE MAGIC FIX: Force Vercel to bundle these hidden files
// Without this, you get "Cannot find module '.../evasions/chrome.app'"
const stealthEvasions = [
    'chrome.app',
    'chrome.csi',
    'chrome.loadTimes',
    'chrome.runtime',
    'iframe.contentWindow',
    'media.codecs',
    'navigator.hardwareConcurrency',
    'navigator.languages',
    'navigator.permissions',
    'navigator.plugins',
    'navigator.vendor',
    'navigator.webdriver',
    'sourceurl',
    'user-agent-override',
    'webgl.vendor',
    'window.outerdimensions'
];
stealthEvasions.forEach(evasion => {
    try { require(`puppeteer-extra-plugin-stealth/evasions/${evasion}`); } catch (e) {}
});

// Initialize Puppeteer with Stealth
const puppeteer = addExtra(puppeteerCore);
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

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

    async randomSleep(min = 1000, max = 3000) {
        const delay = Math.floor(Math.random() * (max - min + 1) + min);
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    getRandomUserAgent() {
        return new UserAgent({ deviceCategory: 'desktop' }).toString();
    }

    // METHOD 1: Static (Axios)
    async scrapeStatic(url) {
        const userAgent = this.getRandomUserAgent();
        const proxyConfig = this.getProxyConfig();
        console.log(`[🚀] Mode: Static (Axios) | Target: ${url}`);
        
        const axiosOptions = {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            },
            timeout: 8000
        };

        if (proxyConfig) {
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

    // METHOD 2: Dynamic (Puppeteer Core)
    async scrapeDynamic(url) {
        const userAgent = this.getRandomUserAgent();
        const proxyConfig = this.getProxyConfig();
        console.log(`[🤖] Mode: Dynamic (Puppeteer Core) | Target: ${url}`);

        // --- VERCEL SPECIFIC LAUNCH OPTIONS ---
        let executablePath = await chromium.executablePath();
        
        // If running locally (not Vercel), you might need a local Chrome path.
        // But @sparticuz/chromium usually handles this if configured right, 
        // or fails if it can't find a local install. 
        // For local testing, you might need to hardcode your Chrome path below if it crashes locally.
        
        const launchArgs = [
            ...chromium.args,
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security'
        ];

        if (proxyConfig) {
            launchArgs.push(`--proxy-server=${proxyConfig.serverString}`);
        }

        const browser = await puppeteer.launch({
            args: launchArgs,
            defaultViewport: chromium.defaultViewport,
            executablePath: executablePath, 
            headless: chromium.headless, // 'new' on local, true on vercel
            ignoreHTTPSErrors: true
        });

        try {
            const page = await browser.newPage();
            if (proxyConfig) await page.authenticate(proxyConfig.auth);
            
            await page.setUserAgent(userAgent);
            
            console.log(`[⏳] Navigating...`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }); // Short timeout for Vercel
            
            await this.randomSleep(1000, 2000);

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

    const useDynamic = mode === 'dynamic' || site.includes('siits.store'); // Force dynamic for your target

    try {
        let htmlData;
        if (useDynamic) {
            htmlData = await engine.scrapeDynamic(site);
        } else {
            try {
                htmlData = await engine.scrapeStatic(site);
            } catch (e) {
                console.log("[⚠️] Static failed, switching to dynamic...");
                htmlData = await engine.scrapeDynamic(site);
            }
        }
        
        // Clean up output
        const $ = cheerio.load(htmlData);
        res.setHeader('Content-Type', 'text/plain');
        res.send($.html());

    } catch (error) {
        console.error(`[❌] Error: ${error.message}`);
        res.status(500).send(`Scrape Failed: ${error.message}`);
    }
});

// For Vercel, we export the app. 
// If local, we listen.
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`⚡ Running locally on http://localhost:${PORT}`));
}

module.exports = app;
