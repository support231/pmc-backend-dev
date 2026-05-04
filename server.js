import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { upload, extractUploadedText } from "./upload.js";

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

- Give a direct and concise answer
- Use only as much detail as needed
- Prefer clarity over completeness
- Answer exactly what is asked

FOLLOW-UP:
- Treat follow-ups as continuation
- If user refers to a point, answer only that part
- Do not repeat previous content
- Stay strictly within the scope of the question

OUTPUT:
- Plain text only
- Simple readable structure
- Always complete sentences
`;

// ===============================
// SYSTEM INSTRUCTIONS
// ===============================

// ---------- PMC MODE ----------
const PMC_SYSTEM_INSTRUCTION = `
You are PMC CENTRE AI, a technical expert in paper machine clothing.

Provide direct, practical, experience-based answers.

- Do not explain beyond the question scope
- Do not introduce new sections unless asked

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

      answer = r.output_text || "";
    }

    // ===============================
    // PMC MODE
    // ===============================

    else if (mode === "PMC") {
      const userContent = uploadedText
        ? `MATERIAL:\n${uploadedText}\n\nQUESTION:\n${question}`
        : question;

      const r = await openai.responses.create({
        model: "gpt-5.2",
        input: buildInput(PMC_SYSTEM_INSTRUCTION, userContent),
        max_output_tokens: 600
      });

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
        max_output_tokens: 400
      });

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("PMC CENTRE AI backend running on port", PORT);
});
