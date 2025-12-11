const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const UserAgent = require('user-agents');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// --- ENVIRONMENT DETECTION ---
const IS_VERCEL = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;

class ScraperEngine {
    constructor() {
        // Leave empty unless you have a paid proxy
        this.proxies = [];
    }

    getProxyConfig() {
        if (this.proxies.length === 0) return null;
        const rawProxy = this.proxies[Math.floor(Math.random() * this.proxies.length)];
        
        try {
            if (rawProxy.includes('@')) {
                const url = new URL(rawProxy);
                return {
                    host: url.hostname,
                    port: parseInt(url.port),
                    auth: { username: url.username, password: url.password },
                    serverString: `${url.hostname}:${url.port}`
                };
            } else {
                const parts = rawProxy.split(':');
                if (parts.length === 4) {
                    return {
                        host: parts[0],
                        port: parseInt(parts[1]),
                        auth: { username: parts[2], password: parts[3] },
                        serverString: `${parts[0]}:${parts[1]}`
                    };
                }
            }
        } catch (e) { return null; }
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
            headers: { 
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9' 
            },
            timeout: 15000
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
        console.log(`[🤖] Dynamic Mode | Environment: ${IS_VERCEL ? 'Vercel' : 'Render/Local'}`);
        
        let browser;
        let page;
        const userAgent = this.getRandomUserAgent();
        const proxyConfig = this.getProxyConfig();

        if (IS_VERCEL) {
            const chromium = require('@sparticuz/chromium');
            const puppeteerCore = require('puppeteer-core');
            chromium.setGraphicsMode = false;

            const launchArgs = [
                ...chromium.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
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
            if (proxyConfig) await page.authenticate(proxyConfig.auth);

            await page.setUserAgent(userAgent);
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });

            // Fast but safe loading
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await this.randomSleep(2000, 4000);

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

// --- API ENDPOINT ---
app.get('/api/scrape', async (req, res) => {
    let { site, mode, download } = req.query; // Added download param

    if (!site) return res.status(400).send('Error: Missing "site" parameter.');
    if (!/^https?:\/\//i.test(site)) site = 'https://' + site;

    const targetUrl = new URL(site);
    const baseUrl = `${targetUrl.protocol}//${targetUrl.host}`;
    const domainName = targetUrl.hostname.replace('www.', '').split('.')[0];
    const timestamp = new Date().getTime();

    const useDynamic = mode === 'dynamic' || site.includes('siits.store');

    try {
        let htmlData;
        if (useDynamic) {
            htmlData = await engine.scrapeDynamic(site);
        } else {
            try {
                htmlData = await engine.scrapeStatic(site);
            } catch (e) {
                console.log(`[⚠️] Static failed, switching to Dynamic...`);
                htmlData = await engine.scrapeDynamic(site);
            }
        }

        const $ = cheerio.load(htmlData);
        
        // Base tag injection for correct image loading
        if ($('base').length === 0) {
            $('head').prepend(`<base href="${baseUrl}">`);
        }

        const finalHtml = $.html();

        // --- NEW: Download Logic ---
        if (download) {
            if (download === 'txt') {
                res.setHeader('Content-Disposition', `attachment; filename="${domainName}_${timestamp}.txt"`);
                res.setHeader('Content-Type', 'text/plain');
                return res.send(finalHtml);
            } 
            else if (download === 'html') {
                res.setHeader('Content-Disposition', `attachment; filename="${domainName}_${timestamp}.html"`);
                res.setHeader('Content-Type', 'text/html');
                return res.send(finalHtml);
            }
        }

        // Default: Plain text for display
        res.setHeader('Content-Type', 'text/plain');
        res.send(finalHtml);

    } catch (error) {
        console.error(`[❌] Error: ${error.message}`);
        res.status(500).send(`Scrape Failed: ${error.message}`);
    }
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`⚡ Scraper running on http://localhost:${PORT}`);
    });
}

module.exports = app;
