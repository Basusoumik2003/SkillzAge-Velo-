import { chatComplete } from "./llmService.js";

const SUMMARY_SYSTEM_PROMPT = `You maintain a compact running memory of a coaching conversation between an AI startup mentor and a student.
Given the previous summary (if any) and the latest turn, write an updated summary.
Rules:
- Third person, factual, no filler.
- Capture: the student's idea/decisions, open questions, commitments made, and anything the mentor should remember next time.
- Keep it under 120 words.
- Output only the summary text, no preamble.`;

/**
 * Produces an updated running summary for a session using a cheap model.
 * Falls back to simple truncation (never throws) if the LLM call fails —
 * memory is a nice-to-have, not something that should break the chat flow.
 */
export async function summarizeSession({ existingSummary, question, answer }) {
  const fallback = [
    existingSummary ? existingSummary : null,
    `Q: ${String(question || "").slice(0, 160)}`,
    `A: ${String(answer || "").slice(0, 160)}`
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 800);

  try {
    const { text } = await chatComplete({
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `Previous summary: ${existingSummary || "(none yet)"}`,
            `Student's latest question: ${question}`,
            `Mentor's latest answer: ${String(answer || "").slice(0, 2000)}`
          ].join("\n\n")
        }
      ],
      light: true,
      temperature: 0.2,
      maxTokens: 200
    });
    return { summary: text, generatedByLlm: true };
  } catch {
    return { summary: fallback, generatedByLlm: false };
  }
}
