import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { upload, extractUploadedText } from "./upload.js";
import { loadKB } from "./utils/kbLoader.js";
import { findRelevantKB } from "./utils/kbMatcher.js";
import { extractTokenUsage } from "./utils/tokenTracker.js";
const app = express();
app.use(cors());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ===============================
// CORE RULES (MINIMAL + STRONG)
// ===============================

const CORE_RULES = `
You are a practical and intelligent assistant.

OUTPUT:
- Give a direct and concise answer in plain text.
- Simple readable structure
- Prioritize key points and finish cleanly.
- Always complete the answer properly with closing question.
`;

// ===============================
// SYSTEM INSTRUCTIONS
// ===============================

// ---------- PMC MODE ----------
const PMC_SYSTEM_INSTRUCTION = `
You are PMC CENTRE AI, a highly experienced technical expert in paper machine clothing.

When PMC Knowledge Base context is provided:
- prioritize it naturally
- use it intelligently
- combine it with your own papermaking and PMC expertise

If the KB does not fully answer the question:
- use your own technical reasoning and industry knowledge

- Finish properly with a closing question

${CORE_RULES}
`;

// ---------- GENERAL MODE ----------
const GENERAL_SYSTEM_INSTRUCTION = `
You are a helpful and intelligent AI assistant.

${CORE_RULES}
`;

// ---------- LIVE MODE ----------
const LIVE_SYSTEM_INSTRUCTION = `
You are a live information assistant.

Use current web information when needed.
Start answers with: "Based on live web information as of today:"

${CORE_RULES}
`;

// ===============================
// HELPER
// ===============================

function normalizeQuery(input) {
  if (!input) return "";
  return input.trim().replace(/\s+/g, " ").slice(0, 2000);
}
function logTokenUsage(mode, response) {
  const tokenUsage = extractTokenUsage(response);

  console.log("TOKEN USAGE:", {
    mode,
    input: tokenUsage.inputTokens,
    output: tokenUsage.outputTokens,
    total: tokenUsage.totalTokens
  });
}

// ===============================
// ASK ENDPOINT
// ===============================

app.post("/ask", upload.single("file"), async (req, res) => {
  try {
    let { question, mode, lastAnswer } = req.body;

    question = normalizeQuery(question);
    lastAnswer = (lastAnswer || "").toString();

    if (!question) {
      return res.json({
        answer: "Could you tell me what you'd like help with?"
      });
    }

    let uploadedText = "";
    let fileNote = "";

    if (req.file) {
      uploadedText = await extractUploadedText(req.file);

      if (!uploadedText || uploadedText.trim().length < 30) {
        fileNote =
          "Note: File received but readable content was limited. Answering based on your question.\n\n";
        uploadedText = "";
      }

      if (uploadedText.length > 6000) {
        uploadedText = uploadedText.slice(0, 6000);
      }
    }

    let answer = "";

    // ===============================
    // CONTEXT (MICRO - LAST ANSWER ONLY)
    // ===============================

    function buildInput(systemInstruction, userContent) {
      return [
        { role: "system", content: systemInstruction },
        ...(lastAnswer
          ? [{ role: "assistant", content: lastAnswer.slice(0, 800) }]
          : []),
        { role: "user", content: userContent }
      ];
    }

    // ===============================
    // LIVE MODE
    // ===============================

    if (mode === "LIVE") {
      if (req.file) {
        return res.json({
          answer:
            "Current Updates mode does not support document or image analysis. Please switch mode."
        });
      }

      const r = await openai.responses.create({
        model: "gpt-5.2",
        tools: [{ type: "web_search" }],
        input: buildInput(LIVE_SYSTEM_INSTRUCTION, question),
        max_output_tokens: 400
      });
      logTokenUsage("LIVE", r);
      answer = r.output_text || "";
    }

    // ===============================
    // PMC MODE
    // ===============================

    else if (mode === "PMC") {

  const relevantKB = findRelevantKB(question);
  // console.log("Relevant KB:", relevantKB);
  let kbContext = "";

  if (relevantKB.length > 0) {

    kbContext =
      "PMC KNOWLEDGE BASE:\n\n" +
      relevantKB.map(item =>
        `TOPIC: ${item.topic}\n${item.content}`
      ).join("\n\n---\n\n");

    kbContext = kbContext.slice(0, 4000);
  }

  const userContent = `
${kbContext ? kbContext + "\n\n" : ""}

${uploadedText ? `DOCUMENT:\n${uploadedText}\n\n` : ""}

QUESTION:
${question}
`;

  const r = await openai.responses.create({
    model: "gpt-5.2",
    input: buildInput(
      PMC_SYSTEM_INSTRUCTION,
      userContent
    ),
    max_output_tokens: 1000
  });
logTokenUsage("PMC", r);
  answer = r.output_text || "";
}
    // ===============================
    // GENERAL MODE
    // ===============================

    else {
      const userContent = uploadedText
        ? `DOCUMENT:\n${uploadedText}\n\nQUESTION:\n${question}`
        : question;

      const r = await openai.responses.create({
        model: "gpt-5.2",
        input: buildInput(GENERAL_SYSTEM_INSTRUCTION, userContent),
        max_output_tokens: 600
      });
    logTokenUsage("GENERAL", r);
      answer = r.output_text || "";
    }

    // ===============================
    // FINAL CLEAN
    // ===============================

    answer = (fileNote + answer).trim();

    if (!answer) {
      answer = "Please try rephrasing your question.";
    }

    res.json({ answer });

  } catch (err) {
    console.error("ASK ERROR:", err);

    res.json({
      answer: "Something went wrong. Please try again."
    });
  }
});

// ===============================
// START SERVER
// ===============================
loadKB();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("PMC CENTRE AI backend running on port", PORT);
});
