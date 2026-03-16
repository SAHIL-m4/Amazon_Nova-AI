/**
 * nova/lite.js
 * Amazon Nova 2 Lite — Agentic reasoning + document retrieval
 * Uses tool calls to search the knowledge base and synthesize answers
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const kb = require('./knowledge');

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const MODEL_ID = process.env.BEDROCK_MODEL_LITE || 'amazon.nova-lite-v1:0';

// ─── TOOLS ──────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    toolSpec: {
      name: 'search_documentation',
      description: 'Search the developer knowledge base for relevant documentation, code examples, or technical guides. Use this whenever the user asks about how to do something, what something is, or needs technical details.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query to find relevant documentation chunks'
            },
            top_k: {
              type: 'number',
              description: 'Number of results to retrieve (default: 5, max: 10)'
            }
          },
          required: ['query']
        }
      }
    }
  },
  {
    toolSpec: {
      name: 'list_documents',
      description: 'List all available documentation sources in the knowledge base. Use when the user asks what docs are available, or to understand what topics are covered.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {}
        }
      }
    }
  }
];

// ─── SYSTEM PROMPT ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Nova DevDocs, an expert voice assistant for software developers.
Your purpose: answer technical questions accurately and concisely using the available documentation.

PERSONALITY:
- Talk like a senior developer colleague — friendly, direct, precise
- Never waffle. If you know the answer, give it immediately
- If the docs don't cover something, say so clearly and offer general knowledge

RESPONSE RULES:
- Keep answers focused: 2-4 sentences for simple questions, more for complex ones
- Format for voice: avoid markdown headers, use plain readable sentences
- For code: mention package names and key functions verbally, don't recite entire code blocks
- Always use the search_documentation tool before answering technical questions
- If your first search doesn't find enough, search again with different terms

TOOL USE:
- ALWAYS search before answering technical questions
- Use list_documents if asked what topics are covered
- Search multiple times if the first result is insufficient`;

// ─── MAIN QUERY FUNCTION ─────────────────────────────────────────────────────

/**
 * Query Nova 2 Lite with agentic tool use
 * @param {string} userMessage
 * @param {Array} conversationHistory - array of {role, content} objects
 * @returns {Promise<{answer: string, sources: string[], toolCalls: number}>}
 */
async function query(userMessage, conversationHistory = []) {
  const messages = [
    ...conversationHistory,
    { role: 'user', content: [{ text: userMessage }] }
  ];

  let toolCalls = 0;
  const sources = new Set();
  let finalAnswer = '';

  // Agentic loop — Nova 2 Lite may call tools multiple times
  while (true) {
    const response = await client.send(new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        system: [{ text: SYSTEM_PROMPT }],
        messages,
        toolConfig: { tools: TOOLS },
        inferenceConfig: {
          maxTokens: 1024,
          temperature: 0.3
        }
      })
    }));

    const result = JSON.parse(Buffer.from(response.body).toString());
    const stopReason = result.stopReason;
    const content = result.output?.message?.content || [];

    // Add assistant response to message history
    messages.push({ role: 'assistant', content });

    // If model wants to use tools
    if (stopReason === 'tool_use') {
      const toolResults = [];

      for (const block of content) {
        if (block.toolUse) {
          toolCalls++;
          const { toolUseId, name, input } = block.toolUse;
          let toolResult = '';

          if (name === 'search_documentation') {
            const results = kb.search(input.query, input.top_k || 5);
            if (results.length === 0) {
              toolResult = 'No relevant documentation found for this query.';
            } else {
              results.forEach(r => sources.add(r.source));
              toolResult = results.map((r, i) =>
                `[${i + 1}] From ${r.source}:\n${r.content}`
              ).join('\n\n');
            }
          } else if (name === 'list_documents') {
            const summary = kb.getSummary();
            toolResult = summary.sources.length > 0
              ? `Available documents: ${summary.sources.join(', ')}. Total: ${summary.totalChunks} indexed chunks.`
              : 'No documents loaded yet. Upload files via the app interface or drop them in the /knowledge-base folder.';
          }

          toolResults.push({
            toolResult: {
              toolUseId,
              content: [{ text: toolResult }]
            }
          });
        }
      }

      // Feed tool results back
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Model finished — extract final text answer
    for (const block of content) {
      if (block.text) finalAnswer += block.text;
    }

    break;
  }

  return {
    answer: finalAnswer.trim(),
    sources: [...sources],
    toolCalls
  };
}

module.exports = { query };
