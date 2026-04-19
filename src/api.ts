import { GoogleGenAI } from "@google/genai";

export async function fetchFeed(url: string) {
  const res = await fetch("/api/feed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to fetch feed");
  }
  return res.json();
}

export async function rewriteArticleWithAI(text: string) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini API Key is missing. Configure it in settings.");
  }
  
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Rewrite the following article into a clean, concise, and easy-to-read format. Preserve the core message but improve flow and readability. Return ONLY the rewritten text in clean Markdown format without any conversational preamble. Replace any complex or broken formatting with simple markdown structures.

Source Article:
${text}`,
  });
  
  if (!response.text) {
    throw new Error("AI returned an empty response.");
  }
  
  return response.text;
}
