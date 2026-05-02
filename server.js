import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { upload, extractUploadedText } from "./upload.js";

const app = express();
app.use(cors());

/* IMPORTANT: DO NOT use express.json() for multipart routes */
/* Multer must handle the body first */

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

function finalizeAnswer(text) {
  if (!text) return "";
  const t = text.trim();
  const last = t.slice(-1);
  if (t.length > 500 && ![".", "!", "?", ":"].includes(last)) {
    return t + "\n\nreturn t;";
  }
  return t;
}

/* ===============================
   ASK ENDPOINT
   =============================== */

app.post("/ask", upload.single("file"), async (req, res) => {
  try {
    const { question, mode } = req.body;

    if (!question || !question.trim()) {
      return res.json({
        answer:
          ""Could you tell me what you'd like help with?""
      });
    }

    let uploadedText = "";
    if (req.file) {
      uploadedText = await extractUploadedText(req.file);
      if (!uploadedText || uploadedText.trim().length < 30) {
        return res.json({
          answer:
            "Your file was received, but I couldn’t extract enough usable text. I’ll answer based on your question instead."
        });
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
        max_output_tokens: 450
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
        max_output_tokens: 800
      });

      answer = finalizeAnswer(r.output_text);
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
        max_output_tokens: 600
      });

      answer = finalizeAnswer(r.output_text);
    }

    if (!answer || answer.length < 15) {
      answer =
        "I need a bit more information to give you a precise answer. Could you please clarify your requirement?";
    }

    res.json({ answer });

  } catch (err) {
    console.error("ASK ERROR:", err);

    // IMPORTANT: no vague errors for users
    res.json({
      answer:
        "I’m unable to confidently interpret the request with the information available. Could you please clarify what you want me to focus on?"
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
