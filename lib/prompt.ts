import { NUTRIENTS, type AiResult, type Ingredient, type NutrientKey } from "./types";

const KEYS = NUTRIENTS.map((n) => n.key);

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

  return `I'm tracking the nutrition of a home-cooked meal${mealName.trim() ? ` ("${mealName.trim()}")` : ""}. For each ingredient below, give its nutrition values per 100 g, as weighed: energy (kcal), fat, saturated fat, carbohydrates, sugars, fibre, protein and salt (all in grams except energy).

${description.trim() ? `Recipe notes: ${description.trim()}\n\n` : ""}Ingredients:
${lines.join("\n")}
${
  photoRows.length
    ? `\nI've attached ${photoRows.length > 1 ? "package photos" : "a package photo"} for: ${photoRows
        .map(({ ing, n }) => `#${n} ${ing.name.trim()}`)
        .join(", ")}${photoRows.length > 1 ? " (in that order)" : ""}. Read the "per 100 g" values from the nutrition label (if energy is only in kJ, divide by 4.184; if only per-portion values are given, convert to per 100 g). Set source to "label".\n`
    : ""
}
For ingredients without a photo, search the web for their values: for a named brand or product, use the manufacturer's or a retailer's product page; otherwise use a food composition database (e.g. USDA FoodData Central or national food tables). Set source to "web" and name the site in the note. Only if you can't search the web, use your own knowledge and set source to "estimate".

Rules:
- Assume ingredients are weighed raw/dry unless the name says otherwise (e.g. "cooked rice"); mention the assumption in the note when it matters.
- If a value is genuinely unknown, use null rather than guessing wildly.
- Don't calculate totals — I'll do the arithmetic.

Reply with only this JSON in a code block, one entry per ingredient, "n" being the ingredient's number:
\`\`\`json
{"ingredients":[{"n":1,"kcal":0,"fat":0,"satFat":0,"carbs":0,"sugars":0,"fiber":0,"protein":0,"salt":0,"source":"label | web | estimate","note":"short reason / source site"}],"notes":"short overall remarks or empty"}
\`\`\``;
}

/** Older replies (calories only) used "kcalPer100g". */
const ALIASES: Partial<Record<string, NutrientKey>> = { kcalPer100g: "kcal" };

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
    if (!Number.isInteger(n)) return [];
    const values: AiResult["ingredients"][number]["values"] = {};
    for (const [field, v] of Object.entries(r)) {
      const key = (KEYS as string[]).includes(field) ? (field as NutrientKey) : ALIASES[field];
      const num = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
      if (key && v != null && Number.isFinite(num) && num >= 0) values[key] = num;
    }
    if (Object.keys(values).length === 0) return [];
    const source: AiResult["ingredients"][number]["source"] =
      r.source === "label" ? "label" : r.source === "web" ? "web" : "estimate";
    return [{ n, values, source, note: typeof r.note === "string" ? r.note : "" }];
  });
  if (ingredients.length === 0) throw new Error("No usable ingredient values in the reply.");

  const notes = (data as { notes?: unknown }).notes;
  return { ingredients, notes: typeof notes === "string" ? notes : "" };
}
