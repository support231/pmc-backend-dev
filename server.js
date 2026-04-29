// ===============================
// IMPORTS & SETUP
// ===============================

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
// COMMON FORMAT RULES (LIGHT)
// ===============================

const FORMAT_RULES = `
- Use plain text only.
- Do NOT use Markdown symbols like *, #, -, **.
- Use simple CAPITAL LETTER headings where needed.
- Keep answers clean, readable, and professional.
`;

// ===============================
// SYSTEM INSTRUCTIONS
// ===============================

// ---------- PMC MODE (KEEP STRONG) ----------
const PMC_SYSTEM_INSTRUCTION = `
You are PMC CENTRE AI, a senior technical consultant for paper machine clothing professionals.

${FORMAT_RULES}

- Provide expert-level, practical technical answers.
- If machine type, grade, or section is missing, ask targeted clarification.
- Be concise, structured, and experience-based.
`;

// ---------- GENERAL MODE (SIMPLIFIED) ----------
const GENERAL_SYSTEM_INSTRUCTION = `
You are a helpful and intelligent AI assistant.

${FORMAT_RULES}

- Understand user intent even if the input is short, incomplete, or has spelling mistakes.
- Treat follow-up inputs as continuation of previous conversation.
- Respond clearly and naturally.
- Ask clarification only when truly necessary.
`;

// ---------- LIVE MODE (SIMPLIFIED) ----------
const LIVE_SYSTEM_INSTRUCTION = `
You are a live information assistant.

${FORMAT_RULES}

- Use current web information when needed.
- Understand user intent even if input is short or imperfect.
- Ask clarification only if necessary.
- Start answers with: "Based on live web information as of today:"
`;

// ===============================
// HELPER FUNCTION
// ===============================

function finalizeAnswer(text) {
  if (!text) return "";
  const t = text.trim();
  const last = t.slice(-1);
  if (t.length > 500 && ![".", "!", "?", ":"].includes(last)) {
    return t + "\n\nIf you want, I can continue with more detail.";
  }
  return t;
}

// ===============================
// ASK ENDPOINT
// ===============================

app.post("/ask", upload.single("file"), async (req, res) => {
  try {
    const { question, mode, history } = req.body;

    // ===============================
    // BASIC INPUT CHECK
    // ===============================
    if (!question || !question.trim()) {
      return res.json({
        answer:
          "I need a bit more detail to proceed. Could you please clarify your question?"
      });
    }

    // ===============================
    // FILE HANDLING (UNCHANGED)
    // ===============================
    let uploadedText = "";

    if (req.file) {
      uploadedText = await extractUploadedText(req.file);

      if (!uploadedText || uploadedText.trim().length < 30) {
        return res.json({
          answer:
            "I received the uploaded file, but I could not extract enough readable information. Please clarify what you want me to analyze."
        });
      }

      if (uploadedText.length > 6000) {
        uploadedText = uploadedText.slice(0, 6000);
      }
    }

    // ===============================
    // HISTORY HANDLING (MAIN FIX)
    // ===============================
    const chatHistory = Array.isArray(history) ? history : [];

    let answer = "";

    // ===============================
    // LIVE MODE
    // ===============================
    if (mode === "LIVE") {
      if (req.file) {
        return res.json({
          answer:
            "Current Updates mode does not support document analysis. Please use PMC or General mode."
        });
      }

      const r = await openai.responses.create({
        model: "gpt-5.2",
        tools: [{ type: "web_search" }],
        input: [
          { role: "system", content: LIVE_SYSTEM_INSTRUCTION },
          ...chatHistory,
          { role: "user", content: question }
        ],
        max_output_tokens: 450
      });

      answer = r.output_text || "";
    }

    // ===============================
    // PMC MODE
    // ===============================
    else if (mode === "PMC") {
      const userContent = uploadedText
        ? `UPLOADED MATERIAL:\n${uploadedText}\n\nTECHNICAL QUESTION:\n${question}`
        : question;

      const r = await openai.responses.create({
        model: "gpt-5.2",
        input: [
          { role: "system", content: PMC_SYSTEM_INSTRUCTION },
          ...chatHistory,
          { role: "user", content: userContent }
        ],
        max_output_tokens: 800
      });

      answer = finalizeAnswer(r.output_text);
    }

    // ===============================
    // GENERAL MODE
    // ===============================
    else {
      const userContent = uploadedText
        ? `DOCUMENT CONTENT:\n${uploadedText}\n\nQUESTION:\n${question}`
        : question;

      const r = await openai.responses.create({
        model: "gpt-5.2",
        input: [
          { role: "system", content: GENERAL_SYSTEM_INSTRUCTION },
          ...chatHistory,
          { role: "user", content: userContent }
        ],
        max_output_tokens: 600
      });

      answer = finalizeAnswer(r.output_text);
    }

    // ===============================
    // FALLBACK SAFETY
    // ===============================
    if (!answer || answer.length < 15) {
      answer =
        "I couldn’t fully understand that. Please rephrase or add a bit more detail.";
    }

    res.json({ answer });

  } catch (err) {
    console.error("ASK ERROR:", err);

    res.json({
      answer:
        "I couldn’t process that properly. Please rephrase your question or add more detail."
    });
  }
});

// ===============================
// SERVER START
// ===============================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("PMC CENTRE AI backend running on port", PORT);
});
