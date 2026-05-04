import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { upload, extractUploadedText } from "./upload.js";

const app = express();
app.use(cors());

/* IMPORTANT: DO NOT use express.json() for multipart routes */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ===============================
// COMMON CORE RULES (OPTIMIZED)
// ===============================

const CORE_RULES = `
You are a practical and intelligent assistant.

RESPONSE STYLE:
- Give a direct and concise answer
- Use only as much detail as needed for the question
- Prefer clarity over completeness
- Understand imperfect or short input naturally

FOLLOW-UP:
- Treat follow-ups as continuation
- If user refers to a point, answer only that part
- Do not repeat previous content

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
You are PMC CENTRE AI, a helpful, intelligent, and natural AI technical assistant for paper machine clothing.

${CORE_RULES}
`;

// ---------- GENERAL MODE ----------
const GENERAL_SYSTEM_INSTRUCTION = `
You are a helpful, intelligent, and natural AI assistant.

${CORE_RULES}
`;

// ---------- LIVE MODE ----------
const LIVE_SYSTEM_INSTRUCTION = `
You are a live information assistant.

Use current web information when relevant.
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

/* ===============================
   ASK ENDPOINT
   =============================== */

app.post("/ask", upload.single("file"), async (req, res) => {
  try {
    let { question, mode } = req.body;

    question = normalizeQuery(question);

    // ---------- EMPTY INPUT (SOFT UX, NOT FALLBACK) ----------
    if (!question) {
      return res.json({
        answer: "Could you tell me what you'd like help with?"
      });
    }

    let uploadedText = "";
    let fileNote = "";

    // ---------- FILE HANDLING (NO HARD STOP) ----------
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

    /* ---------- LIVE MODE ---------- */
    if (mode === "LIVE") {
      if (req.file) {
        return res.json({
          answer:
            "Current Updates mode does not support document or image analysis. Please switch to PMC Expert Mode or General AI Assistant."
        });
      }

      const r = await openai.responses.create({
        model: "gpt-5.2",
        tools: [{ type: "web_search" }],
        input: [
          { role: "system", content: LIVE_SYSTEM_INSTRUCTION },
          { role: "user", content: question }
        ],
        max_output_tokens: 600
      });

      answer = r.output_text || "";
    }

    /* ---------- PMC MODE ---------- */
    else if (mode === "PMC") {
      const userContent = uploadedText
        ? `UPLOADED MATERIAL:\n${uploadedText}\n\nTECHNICAL QUESTION:\n${question}`
        : question;

      const r = await openai.responses.create({
        model: "gpt-5.2",
        input: [
          { role: "system", content: PMC_SYSTEM_INSTRUCTION },
          { role: "user", content: userContent }
        ],
        max_output_tokens: 900
      });

      answer = r.output_text || "";
    }

    /* ---------- GENERAL MODE ---------- */
    else {
      const r = await openai.responses.create({
        model: "gpt-5.2",
        input: [
          { role: "system", content: GENERAL_SYSTEM_INSTRUCTION },
          {
            role: "user",
            content:
              uploadedText
                ? `DOCUMENT CONTENT:\n${uploadedText}\n\nQUESTION:\n${question}`
                : question
          }
        ],
        max_output_tokens: 700
      });

      answer = r.output_text || "";
    }

    // ---------- FINAL CLEAN ----------
    answer = (fileNote + answer).trim();

    // LAST SAFETY (VERY LIGHT, NON-INTRUSIVE)
    if (!answer) {
      answer = "I couldn’t generate a proper response this time. Please try rephrasing slightly.";
    }

    res.json({ answer });

  } catch (err) {
    console.error("ASK ERROR:", err);

    // TRUE SYSTEM ERROR ONLY
    res.json({
      answer: "Something went wrong on my side. Please try again."
    });
  }
});

/* ===============================
   START SERVER
   =============================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("PMC CENTRE AI backend running on port", PORT);
});
