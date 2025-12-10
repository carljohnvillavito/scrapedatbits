const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = 3000;

// Serve static files (HTML/CSS/JS)
app.use(express.static('public'));

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
        // Pretend to be a real browser to avoid simple blocks
        const response = await axios.get(site, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        // Set content type to plain text so the browser displays the code, 
        // rather than trying to render the HTML.
        res.setHeader('Content-Type', 'text/plain');
        res.send(response.data);

    } catch (error) {
        console.error(error.message);
        res.status(500).send(`Failed to scrape: ${error.message}`);
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`⚡ ScrapeDatBits is running on http://localhost:${PORT}`);
});
