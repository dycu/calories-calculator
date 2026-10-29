import type { AiResult, Ingredient } from "./types";

/**
 * Build a prompt to paste into any AI chat. Ingredients are numbered so the
 * reply can be matched back even if the AI tweaks the names.
 */
export function buildPrompt(mealName: string, description: string, ingredients: Ingredient[]): string {
  const photoRows = ingredients.map((ing, idx) => ({ ing, n: idx + 1 })).filter(({ ing }) => ing.hasPhoto);
  const lines = ingredients.map(
    (ing, idx) =>
      `${idx + 1}. ${ing.name.trim()} — ${ing.grams ?? "?"} g${ing.hasPhoto ? " (package photo attached)" : ""}`,
  );

  return `I'm tracking calories of a home-cooked meal${mealName.trim() ? ` ("${mealName.trim()}")` : ""}. For each ingredient below, give its energy density in kcal per 100 g, as weighed.

${description.trim() ? `Recipe notes: ${description.trim()}\n\n` : ""}Ingredients:
${lines.join("\n")}
${
  photoRows.length
    ? `\nI've attached ${photoRows.length > 1 ? "package photos" : "a package photo"} for: ${photoRows
        .map(({ ing, n }) => `#${n} ${ing.name.trim()}`)
        .join(", ")}${photoRows.length > 1 ? " (in that order)" : ""}. Read the "per 100 g" energy from the nutrition label (if only kJ is given, divide by 4.184; if only per-portion values are given, convert to per 100 g).\n`
    : ""
}
Rules:
- Without a photo, estimate from standard food composition data.
- Assume ingredients are weighed raw/dry unless the name says otherwise (e.g. "cooked rice"); mention the assumption in the note when it matters.
- Don't calculate totals — I'll do the arithmetic.

Reply with only this JSON in a code block, one entry per ingredient, "n" being the ingredient's number:
\`\`\`json
{"ingredients":[{"n":1,"kcalPer100g":0,"source":"label or estimate","note":"short reason"}],"notes":"short overall remarks or empty"}
\`\`\``;
}

/** Parse the AI's reply. Tolerates surrounding text, code fences and smart quotes. */
export function parseReply(text: string): AiResult {
  const cleaned = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Couldn't find the JSON in the pasted reply.");

  let data: unknown;
  try {
    data = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("The pasted reply isn't valid JSON — copy the whole code block the AI gave you.");
  }

  const raw = (data as { ingredients?: unknown }).ingredients;
  if (!Array.isArray(raw)) throw new Error("The reply has no \"ingredients\" list.");

  const ingredients = raw.flatMap((r: Record<string, unknown>) => {
    const n = Number(r.n);
    const kcal = Number(r.kcalPer100g);
    if (!Number.isInteger(n) || !Number.isFinite(kcal) || kcal < 0) return [];
    return [{
      n,
      kcalPer100g: kcal,
      source: r.source === "label" ? ("label" as const) : ("estimate" as const),
      note: typeof r.note === "string" ? r.note : "",
    }];
  });
  if (ingredients.length === 0) throw new Error("No usable ingredient values in the reply.");

  const notes = (data as { notes?: unknown }).notes;
  return { ingredients, notes: typeof notes === "string" ? notes : "" };
}
