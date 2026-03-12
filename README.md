# Amazon_Nova-AI

 Talk to your docs. Real-time voice assistant for developers built with Amazon Nova 2 Sonic + Nova 2 Lite on AWS Bedrock. 

Nova DevDocs is a real-time voice-powered AI assistant that lets developers speak questions out loud and receive instant spoken answers from their own documentation — no typing, no searching, no context switching.

Developers lose 30–60 minutes daily hunting through wikis, READMEs, and Confluence pages. Nova DevDocs eliminates that entirely. Press a mic button, ask your question out loud, and Nova answers in under a second — conversationally, accurately, hands-free

The project leverages two Amazon Nova foundation models working in tandem. Amazon Nova 2 Sonic handles the real-time speech-to-speech layer — capturing voice input, understanding intent, and delivering the spoken response with near-zero latency. Amazon Nova 2 Lite powers the agentic reasoning layer — it uses tool calls to retrieve relevant chunks from the connected knowledge base, synthesizes answers across multiple documents, and maintains full conversation context for natural follow-up questions.

Models used are:
Amazon Nova 2 SonicReal-time speech-to-speech voice 
Amazon Nova 2 LiteAgentic document reasoning + retrieval
