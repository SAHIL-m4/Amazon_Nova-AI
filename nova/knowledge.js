/**
 * nova/knowledge.js
 * Knowledge base loader and semantic search
 * Supports: .txt, .md, .pdf files
 */

const fs = require('fs');
const path = require('path');

class KnowledgeBase {
  constructor() {
    this.documents = [];
    this.loaded = false;
  }

  /**
   * Load all documents from the knowledge-base directory
   */
  async loadFromDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      console.log('[KB] Knowledge base directory not found, creating...');
      fs.mkdirSync(dirPath, { recursive: true });
      return;
    }

    const files = fs.readdirSync(dirPath).filter(f =>
      ['.txt', '.md', '.pdf'].includes(path.extname(f).toLowerCase())
      && f !== '.gitkeep'
    );

    if (files.length === 0) {
      console.log('[KB] No documents found. Drop .txt/.md/.pdf files into /knowledge-base');
      return;
    }

    for (const file of files) {
      await this.loadFile(path.join(dirPath, file));
    }

    this.loaded = true;
    console.log(`[KB] Loaded ${this.documents.length} document(s)`);
  }

  /**
   * Load a single file into the knowledge base
   */
  async loadFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const name = path.basename(filePath);

    try {
      let content = '';

      if (ext === '.pdf') {
        // PDF parsing
        try {
          const pdfParse = require('pdf-parse');
          const buffer = fs.readFileSync(filePath);
          const data = await pdfParse(buffer);
          content = data.text;
        } catch (e) {
          console.warn(`[KB] PDF parsing failed for ${name}, skipping`);
          return;
        }
      } else {
        // txt and md
        content = fs.readFileSync(filePath, 'utf-8');
      }

      // Split into chunks of ~500 words for better retrieval
      const chunks = this.chunkText(content, 500);

      chunks.forEach((chunk, i) => {
        this.documents.push({
          id: `${name}-chunk-${i}`,
          source: name,
          content: chunk,
          words: chunk.split(/\s+/).length
        });
      });

      console.log(`[KB] ✓ Loaded: ${name} (${chunks.length} chunks)`);
    } catch (err) {
      console.error(`[KB] Error loading ${name}:`, err.message);
    }
  }

  /**
   * Add document from raw text (for in-app uploads)
   */
  addDocument(name, content) {
    const chunks = this.chunkText(content, 500);
    chunks.forEach((chunk, i) => {
      this.documents.push({
        id: `${name}-chunk-${i}`,
        source: name,
        content: chunk,
        words: chunk.split(/\s+/).length
      });
    });
    console.log(`[KB] ✓ Added: ${name} (${chunks.length} chunks)`);
  }

  /**
   * Search the knowledge base for relevant chunks
   * Simple keyword-based search — in production use embeddings
   */
  search(query, topK = 5) {
    if (this.documents.length === 0) return [];

    const queryWords = this.tokenize(query);

    const scored = this.documents.map(doc => {
      const docWords = this.tokenize(doc.content);
      const score = this.bm25Score(queryWords, docWords, this.documents.length);
      return { ...doc, score };
    });

    return scored
      .filter(d => d.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Get all documents summary
   */
  getSummary() {
    const sources = [...new Set(this.documents.map(d => d.source))];
    return {
      totalChunks: this.documents.length,
      sources,
      loaded: this.loaded
    };
  }

  // ─── HELPERS ────────────────────────────────────────

  chunkText(text, targetWords) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks = [];
    let current = [];
    let wordCount = 0;

    for (const sentence of sentences) {
      const words = sentence.split(/\s+/).length;
      if (wordCount + words > targetWords && current.length > 0) {
        chunks.push(current.join(' '));
        current = [sentence];
        wordCount = words;
      } else {
        current.push(sentence);
        wordCount += words;
      }
    }

    if (current.length > 0) chunks.push(current.join(' '));
    return chunks.filter(c => c.trim().length > 50);
  }

  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !this.stopWords.has(w));
  }

  bm25Score(queryWords, docWords, totalDocs, k1 = 1.5, b = 0.75) {
    const avgDocLength = 150;
    const docLength = docWords.length;
    const tf = {};

    docWords.forEach(w => { tf[w] = (tf[w] || 0) + 1; });

    return queryWords.reduce((score, term) => {
      const termFreq = tf[term] || 0;
      if (termFreq === 0) return score;
      const idf = Math.log((totalDocs - 1 + 0.5) / (1 + 0.5) + 1);
      const tfNorm = (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + b * docLength / avgDocLength));
      return score + idf * tfNorm;
    }, 0);
  }

  get stopWords() {
    return new Set(['the','a','an','and','or','but','in','on','at','to','for',
      'of','with','by','from','is','are','was','were','be','been','have','has',
      'had','do','does','did','will','would','could','should','may','might',
      'this','that','these','those','it','its','we','our','you','your','they',
      'their','he','she','his','her','i','my','me','us','not','no','so','if',
      'as','up','out','about','into','than','more','also','can','all','just']);
  }
}

module.exports = new KnowledgeBase();
