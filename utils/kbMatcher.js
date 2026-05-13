import { getKB } from "./kbLoader.js";

function normalize(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text = "") {
  return normalize(text)
    .split(" ")
    .filter(Boolean);
}

export function findRelevantKB(question) {

  const kb = getKB();

  if (!kb.length) return [];

  const normalizedQuestion = normalize(question);

  const tokens = tokenize(question);

  const scored = kb.map(item => {

    let score = 0;

    const searchable = normalize(
      `
      ${item.topic || ""}
      ${item.content || ""}
      ${(item.keywords || []).join(" ")}
      `
    );

    for (const token of tokens) {

      if (searchable.includes(token)) {
        score += 1;
      }
    }

    for (const keyword of item.keywords || []) {

      const k = normalize(keyword);

      if (normalizedQuestion.includes(k)) {
        score += 5;
      }
    }

    return {
      ...item,
      score
    };
  });

  return scored
    .filter(item => item.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
