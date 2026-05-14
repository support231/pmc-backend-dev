export function extractTokenUsage(response) {
  try {
    return {
      inputTokens: response?.usage?.input_tokens || 0,
      outputTokens: response?.usage?.output_tokens || 0,
      totalTokens: response?.usage?.total_tokens || 0
    };
  } catch (err) {
    console.error("Token extraction error:", err);

    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    };
  }
}
