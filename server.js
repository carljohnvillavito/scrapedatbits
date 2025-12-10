const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = 3000;

// Serve static files (HTML/CSS/JS)
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoint
app.get('/api/scrape', async (req, res) => {
    let { site } = req.query;

    if (!site) {
        return res.status(400).send('Error: Missing "site" query parameter.');
    }

    // Add protocol if missing
    if (!/^https?:\/\//i.test(site)) {
        site = 'http://' + site;
    }

    try {
        const response = await axios.get(site, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        res.setHeader('Content-Type', 'text/plain');
        res.send(response.data);

    } catch (error) {
        // Vercel logs
        console.error(error.message);
        res.status(500).send(`Failed to scrape: ${error.message}`);
    }
});

// --- VERCEL CONFIGURATION ---

// Only run app.listen if running locally
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`⚡ ScrapeDatBits is running on http://localhost:${PORT}`);
    });
}

// Export the app for Vercel Serverless environment
module.exports = app;
