/**
 * routes/voice.js
 * Voice pipeline — Nova 2 Sonic → Nova 2 Lite → Nova 2 Sonic
 *
 * POST /api/voice/transcribe   — audio → text
 * POST /api/voice/synthesize   — text → audio
 * POST /api/voice/pipeline     — full round-trip
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { transcribe, synthesize } = require('../nova/sonic');
const { query } = require('../nova/lite');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Session store (shared with chat route in production use Redis)
const sessions = new Map();

/**
 * POST /api/voice/transcribe
 * Multipart: audio file (PCM 16kHz 16-bit mono)
 * Returns: { transcript: string }
 */
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'audio file required' });
  }

  try {
    const transcript = await transcribe(req.file.buffer);
    res.json({ transcript });
  } catch (err) {
    console.error('[Voice] Transcription error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/voice/synthesize
 * Body: { text: string, voiceId?: string }
 * Returns: audio/pcm stream
 */
router.post('/synthesize', async (req, res) => {
  const { text, voiceId } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    const audioBuffer = await synthesize(text, voiceId);
    res.set('Content-Type', 'audio/pcm');
    res.set('X-Sample-Rate', '24000');
    res.send(audioBuffer);
  } catch (err) {
    console.error('[Voice] Synthesis error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/voice/pipeline
 * Full round-trip: voice → transcribe → Nova 2 Lite → synthesize → voice
 * Multipart: audio file + sessionId
 * Returns: { transcript, answer, sources } + audio/pcm stream
 */
router.post('/pipeline', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'audio file required' });
  }

  const sid = req.body.sessionId || `session-${Date.now()}`;
  if (!sessions.has(sid)) sessions.set(sid, []);
  const history = sessions.get(sid);

  try {
    // Step 1: Transcribe audio
    console.log('[Pipeline] Transcribing audio...');
    const transcript = await transcribe(req.file.buffer);
    console.log(`[Pipeline] Transcript: "${transcript}"`);

    // Step 2: Get answer from Nova 2 Lite
    console.log('[Pipeline] Querying Nova 2 Lite...');
    const { answer, sources, toolCalls } = await query(transcript, history);
    console.log(`[Pipeline] Answer ready (${toolCalls} tool calls)`);

    // Update history
    history.push(
      { role: 'user', content: [{ text: transcript }] },
      { role: 'assistant', content: [{ text: answer }] }
    );
    if (history.length > 40) history.splice(0, 2);

    // Step 3: Synthesize answer to speech
    console.log('[Pipeline] Synthesizing speech...');
    const audioBuffer = await synthesize(answer);

    // Return audio with metadata in headers
    res.set('Content-Type', 'audio/pcm');
    res.set('X-Sample-Rate', '24000');
    res.set('X-Transcript', encodeURIComponent(transcript));
    res.set('X-Answer', encodeURIComponent(answer.slice(0, 500)));
    res.set('X-Sources', encodeURIComponent(sources.join(',')));
    res.set('X-Session-Id', sid);
    res.send(audioBuffer);

  } catch (err) {
    console.error('[Pipeline] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
