/**
 * routes/chat.js
 * REST API — Text chat with Nova 2 Lite
 * POST /api/chat
 */

const express = require('express');
const router = express.Router();
const { query } = require('../nova/lite');

// In-memory session store (use Redis in production)
const sessions = new Map();

/**
 * POST /api/chat
 * Body: { message: string, sessionId: string }
 * Returns: { answer: string, sources: string[], sessionId: string }
 */
router.post('/', async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'message is required' });
  }

  // Get or create conversation history for this session
  const sid = sessionId || `session-${Date.now()}`;
  if (!sessions.has(sid)) sessions.set(sid, []);
  const history = sessions.get(sid);

  try {
    console.log(`[Chat] Session ${sid}: "${message.slice(0, 60)}..."`);

    const { answer, sources, toolCalls } = await query(message, history);

    // Update history
    history.push(
      { role: 'user', content: [{ text: message }] },
      { role: 'assistant', content: [{ text: answer }] }
    );

    // Cap history at 20 turns to manage context window
    if (history.length > 40) history.splice(0, 2);

    console.log(`[Chat] Answered in ${toolCalls} tool call(s). Sources: ${sources.join(', ') || 'none'}`);

    res.json({ answer, sources, sessionId: sid, toolCalls });
  } catch (err) {
    console.error('[Chat] Error:', err.message);
    res.status(500).json({
      error: 'Failed to get answer from Nova 2 Lite',
      detail: err.message
    });
  }
});

/**
 * DELETE /api/chat/:sessionId
 * Clear conversation history
 */
router.delete('/:sessionId', (req, res) => {
  sessions.delete(req.params.sessionId);
  res.json({ cleared: true });
});

module.exports = router;
