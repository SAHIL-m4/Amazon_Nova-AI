/**
 * nova/sonic.js
 * Amazon Nova 2 Sonic — Real-time speech-to-speech
 *
 * Nova 2 Sonic handles:
 * 1. Audio input → text transcription
 * 2. Text answer → spoken audio output
 *
 * Architecture:
 *   Browser mic → WebSocket → Nova 2 Sonic (transcribe)
 *   Nova 2 Lite answer → Nova 2 Sonic (synthesize) → Browser audio
 */

const {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand
} = require('@aws-sdk/client-bedrock-runtime');

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const MODEL_ID = process.env.BEDROCK_MODEL_SONIC || 'amazon.nova-sonic-v1:0';

// ─── VOICE SYSTEM PROMPT ──────────────────────────────────────────────────────

const VOICE_SYSTEM_PROMPT = `You are Nova DevDocs, a friendly expert voice assistant for software developers.
Respond in clear, conversational spoken English.
Keep responses concise — under 3 sentences unless asked to elaborate.
Never use markdown, bullet points, or code syntax in speech.
Sound like a knowledgeable colleague, not a robot.`;

// ─── TRANSCRIBE AUDIO ─────────────────────────────────────────────────────────

/**
 * Transcribe audio buffer to text using Nova 2 Sonic
 * @param {Buffer} audioBuffer - Raw PCM audio (16kHz, 16-bit, mono)
 * @returns {Promise<string>} Transcribed text
 */
async function transcribe(audioBuffer) {
  const audioBase64 = audioBuffer.toString('base64');

  const payload = {
    inputAudio: {
      format: 'pcm',
      sampleRate: 16000,
      data: audioBase64
    },
    inferenceConfig: {
      maxTokens: 256
    }
  };

  try {
    const response = await client.send(new InvokeModelWithResponseStreamCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload)
    }));

    let transcript = '';
    for await (const chunk of response.body) {
      if (chunk.chunk?.bytes) {
        const data = JSON.parse(Buffer.from(chunk.chunk.bytes).toString());
        if (data.transcript) transcript += data.transcript;
      }
    }

    return transcript.trim();
  } catch (err) {
    console.error('[Sonic] Transcription error:', err.message);
    throw new Error(`Nova 2 Sonic transcription failed: ${err.message}`);
  }
}

// ─── SYNTHESIZE SPEECH ────────────────────────────────────────────────────────

/**
 * Convert text answer to spoken audio using Nova 2 Sonic
 * @param {string} text - The answer text to speak
 * @param {string} voiceId - Voice to use (default: 'nova')
 * @returns {Promise<Buffer>} PCM audio buffer
 */
async function synthesize(text, voiceId = 'nova') {
  const payload = {
    text,
    voiceId,
    outputFormat: {
      format: 'pcm',
      sampleRate: 24000
    },
    system: VOICE_SYSTEM_PROMPT,
    inferenceConfig: {
      maxTokens: 1024,
      temperature: 0.7
    }
  };

  try {
    const response = await client.send(new InvokeModelWithResponseStreamCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload)
    }));

    const audioChunks = [];
    for await (const chunk of response.body) {
      if (chunk.chunk?.bytes) {
        const data = JSON.parse(Buffer.from(chunk.chunk.bytes).toString());
        if (data.audio) {
          audioChunks.push(Buffer.from(data.audio, 'base64'));
        }
      }
    }

    return Buffer.concat(audioChunks);
  } catch (err) {
    console.error('[Sonic] Synthesis error:', err.message);
    throw new Error(`Nova 2 Sonic synthesis failed: ${err.message}`);
  }
}

// ─── FULL VOICE PIPELINE ──────────────────────────────────────────────────────

/**
 * Full voice round-trip:
 * Audio → Transcribe → Nova 2 Lite → Synthesize → Audio
 *
 * @param {Buffer} audioBuffer - Input audio from mic
 * @param {Function} onTranscript - Called with transcribed text
 * @param {Function} onAnswer - Called with text answer before synthesis
 * @returns {Promise<{audioBuffer: Buffer, transcript: string, answer: string}>}
 */
async function voicePipeline(audioBuffer, onTranscript, onAnswer) {
  // Step 1: Transcribe voice to text
  const transcript = await transcribe(audioBuffer);
  if (onTranscript) onTranscript(transcript);

  // Step 2: Get answer from Nova 2 Lite (imported in route handler)
  // This is passed in as a callback to keep modules decoupled
  if (onAnswer) {
    const answer = await onAnswer(transcript);

    // Step 3: Synthesize answer to speech
    const audio = await synthesize(answer);

    return { audioBuffer: audio, transcript, answer };
  }

  return { transcript };
}

module.exports = { transcribe, synthesize, voicePipeline };
