const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const app = express();
const PORT = 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoint
app.get('/api/scrape', async (req, res) => {
    let { site } = req.query;

    if (!site) {
        return res.status(400).send('Error: Missing "site" query parameter.');
    }

    // Fix URL formatting
    if (!/^https?:\/\//i.test(site)) {
        site = 'https://' + site; // Default to https for better success rates
    }

    try {
        // 1. Fetch the data with "Stealth" Headers
        // We pretend to be a real user coming from Google to avoid 400/403 blocks
        const response = await axios.get(site, {
            timeout: 8000, // 8 second timeout (Vercel limit is 10s)
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Referer': 'https://www.google.com/', // Trick site into thinking we came from Google
                'Cache-Control': 'max-age=0'
            }
        });

        // 2. Load into Cheerio
        const $ = cheerio.load(response.data);

        // Optional: Remove scripts/styles if you want just clean content
        // $('script').remove(); 
        // $('style').remove();

        // 3. Get the full HTML
        const finalHtml = $.html();

        // 4. Send response
        res.setHeader('Content-Type', 'text/plain');
        res.send(finalHtml);

    } catch (error) {
        console.error(`Scrape Error [${site}]:`, error.message);

        // Customize error message for common scraping blocks
        let errorMessage = error.message;
        
        if (error.response) {
            if (error.response.status === 403 || error.response.status === 400) {
                errorMessage = `Target site blocked the request (Anti-bot protection: ${error.response.status}).`;
            } else if (error.response.status === 404) {
                errorMessage = "Site not found (404). Check the URL.";
            }
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = "Request timed out (took too long).";
        }

        res.status(500).send(`Failed: ${errorMessage}`);
    }
});

// --- VERCEL CONFIGURATION ---
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`⚡ ScrapeDatBits is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
