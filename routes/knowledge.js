/**
 * routes/knowledge.js
 * Knowledge base management
 * GET  /api/kb          — list loaded documents
 * POST /api/kb/upload   — upload a document
 * POST /api/kb/url      — add document from URL
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const https = require('https');
const http = require('http');
const kb = require('../nova/knowledge');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

/**
 * GET /api/kb
 * Returns current knowledge base summary
 */
router.get('/', (req, res) => {
  res.json(kb.getSummary());
});

/**
 * POST /api/kb/upload
 * Upload a document file (.txt, .md, .pdf)
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file required' });
  }

  const { originalname, buffer, mimetype } = req.file;

  try {
    if (mimetype === 'application/pdf') {
      // Write temp file for pdf-parse
      const tmp = require('os').tmpdir() + '/' + originalname;
      require('fs').writeFileSync(tmp, buffer);
      await kb.loadFile(tmp);
      require('fs').unlinkSync(tmp);
    } else {
      const content = buffer.toString('utf-8');
      kb.addDocument(originalname, content);
    }

    res.json({
      success: true,
      name: originalname,
      summary: kb.getSummary()
    });
  } catch (err) {
    console.error('[KB Upload] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/kb/url
 * Body: { url: string, name?: string }
 * Fetches raw text from a URL and adds to knowledge base
 */
router.post('/url', async (req, res) => {
  const { url, name } = req.body;

  if (!url) return res.status(400).json({ error: 'url required' });

  // Only allow http/https
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return res.status(400).json({ error: 'Only http/https URLs allowed' });
  }

  try {
    const content = await fetchUrl(url);
    const docName = name || new URL(url).hostname + '-' + Date.now() + '.txt';
    kb.addDocument(docName, content);

    res.json({
      success: true,
      name: docName,
      characters: content.length,
      summary: kb.getSummary()
    });
  } catch (err) {
    console.error('[KB URL] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/kb/text
 * Body: { name: string, content: string }
 * Add raw text directly
 */
router.post('/text', (req, res) => {
  const { name, content } = req.body;

  if (!name || !content) {
    return res.status(400).json({ error: 'name and content required' });
  }

  kb.addDocument(name, content);
  res.json({ success: true, summary: kb.getSummary() });
});

// ─── HELPERS ────────────────────────────────────────────────────────────────

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { timeout: 10000 }, res => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

module.exports = router;
