/**
 * index.js
 * Nova DevDocs — Main server entry point
 *
 * Amazon Nova AI Hackathon 2025
 * Category: Voice AI + Agentic AI
 * Models: Nova 2 Sonic + Nova 2 Lite on AWS Bedrock
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const kb = require('./nova/knowledge');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// ─── ROUTES ──────────────────────────────────────────────────────────────────

app.use('/api/chat', require('./routes/chat'));
app.use('/api/voice', require('./routes/voice'));
app.use('/api/kb', require('./routes/knowledge'));

// Health check
app.get('/api/health', (req, res) => {
  const kbSummary = kb.getSummary();
  res.json({
    status: 'ok',
    models: {
      sonic: process.env.BEDROCK_MODEL_SONIC || 'amazon.nova-sonic-v1:0',
      lite: process.env.BEDROCK_MODEL_LITE || 'amazon.nova-lite-v1:0'
    },
    region: process.env.AWS_REGION || 'us-east-1',
    knowledgeBase: kbSummary,
    uptime: process.uptime()
  });
});

// Catch-all: serve app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'nova-devdocs-app.html'));
});

// ─── START ───────────────────────────────────────────────────────────────────

async function start() {
  console.log('\n🎙  Nova DevDocs — Amazon Nova AI Hackathon');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Nova 2 Sonic : ${process.env.BEDROCK_MODEL_SONIC || 'amazon.nova-sonic-v1:0'}`);
  console.log(`  Nova 2 Lite  : ${process.env.BEDROCK_MODEL_LITE || 'amazon.nova-lite-v1:0'}`);
  console.log(`  AWS Region   : ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Load knowledge base from /knowledge-base directory
  const kbPath = path.join(__dirname, 'knowledge-base');
  console.log('[KB] Loading knowledge base...');
  await kb.loadFromDirectory(kbPath);

  const summary = kb.getSummary();
  if (summary.sources.length > 0) {
    console.log(`[KB] ✓ ${summary.sources.length} document(s) loaded: ${summary.sources.join(', ')}`);
  } else {
    console.log('[KB] ℹ  No documents loaded. Drop files into /knowledge-base or upload via the app.');
  }

  app.listen(PORT, () => {
    console.log(`\n✅ Nova DevDocs running at http://localhost:${PORT}\n`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
