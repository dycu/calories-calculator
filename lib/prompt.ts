import { NUTRIENTS, type AiResult, type Ingredient, type NutrientKey, type Nutrients } from "./types";

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

type AiSource = AiResult["ingredients"][number]["source"];

/** Pull the JSON object out of a pasted reply. Tolerates surrounding text, code fences and smart quotes. */
function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Couldn't find the JSON in the pasted reply.");
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("The pasted reply isn't valid JSON — copy the whole code block the AI gave you.");
  }
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function readValues(r: Record<string, unknown>): Partial<Nutrients> {
  const values: Partial<Nutrients> = {};
  for (const [field, v] of Object.entries(r)) {
    const key = (KEYS as string[]).includes(field) ? (field as NutrientKey) : ALIASES[field];
    const n = toNumber(v);
    if (key && n != null) values[key] = n;
  }
  return values;
}

const readSource = (v: unknown): AiSource => (v === "label" ? "label" : v === "web" ? "web" : "estimate");
const readString = (v: unknown) => (typeof v === "string" ? v : "");

function readIngredients(data: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(data.ingredients)) throw new Error("The reply has no \"ingredients\" list.");
  return data.ingredients.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null);
}

/** Parse the AI's reply to the prompt from buildPrompt. */
export function parseReply(text: string): AiResult {
  const data = extractJson(text);
  const ingredients = readIngredients(data).flatMap((r) => {
    const n = Number(r.n);
    const values = readValues(r);
    if (!Number.isInteger(n) || Object.keys(values).length === 0) return [];
    return [{ n, values, source: readSource(r.source), note: readString(r.note) }];
  });
  if (ingredients.length === 0) throw new Error("No usable ingredient values in the reply.");
  return { ingredients, notes: readString(data.notes) };
}

/**
 * Build a prompt that turns photos of the ingredients into a whole recipe:
 * names, weights and nutrition. The meal name / notes, if already filled in,
 * are passed along as hints.
 */
export function buildRecipePrompt(mealName: string, description: string): string {
  const hints = [
    mealName.trim() && `The meal is "${mealName.trim()}".`,
    description.trim() && `My notes: ${description.trim()}`,
  ].filter(Boolean);

  return `I photographed the ingredients of a meal I'm cooking (photos attached). Build the recipe's ingredient list from them.${
    hints.length ? `\n\n${hints.join("\n")}` : ""
  }

For each ingredient you can see:
- Name it specifically, including the brand / product name if it's visible on the package.
- Weight in grams going into the meal: read it from a kitchen scale display if one is visible ("weight": "scale"); otherwise use the package's net weight if it looks like the whole package is used ("weight": "package"); otherwise estimate from what you see ("weight": "estimate").
- Nutrition values per 100 g, as weighed: energy (kcal), fat, saturated fat, carbohydrates, sugars, fibre, protein and salt (grams except energy). If a nutrition label is readable in a photo, use it (source "label"; if energy is only in kJ divide by 4.184; convert per-portion values to per 100 g). Otherwise search the web: the manufacturer's or a retailer's page for branded products, a food composition database (e.g. USDA FoodData Central or national food tables) for plain foods (source "web", name the site in the note). Only if you can't search the web, use your own knowledge (source "estimate").

Rules:
- Include cooking fat, sauces and seasonings you can see; skip tap water.
- Assume ingredients are weighed raw/dry unless clearly cooked; mention assumptions in the note.
- If a value is genuinely unknown, use null.
- Also suggest a short meal name and a one-line recipe note.

Reply with only this JSON in a code block:
\`\`\`json
{"name":"meal name","description":"one-line recipe note","ingredients":[{"name":"ingredient","grams":0,"weight":"scale | package | estimate","kcal":0,"fat":0,"satFat":0,"carbs":0,"sugars":0,"fiber":0,"protein":0,"salt":0,"source":"label | web | estimate","note":"short reason / source site"}],"notes":"short overall remarks or empty"}
\`\`\``;
}

export interface RecipeResult {
  name: string;
  description: string;
  ingredients: {
    name: string;
    grams: number | null;
    gramsEstimated: boolean;
    values: Partial<Nutrients>;
    source: AiSource;
    note: string;
  }[];
  notes: string;
}

/** Parse the AI's reply to the prompt from buildRecipePrompt. */
export function parseRecipeReply(text: string): RecipeResult {
  const data = extractJson(text);
  const ingredients = readIngredients(data).flatMap((r) => {
    const name = readString(r.name).trim();
    if (!name) return [];
    const grams = toNumber(r.grams);
    return [{
      name,
      grams: grams == null ? null : Math.round(grams),
      gramsEstimated: r.weight !== "scale",
      values: readValues(r),
      source: readSource(r.source),
      note: readString(r.note),
    }];
  });
  if (ingredients.length === 0) throw new Error("No ingredients found in the reply.");
  return {
    name: readString(data.name).trim(),
    description: readString(data.description).trim(),
    ingredients,
    notes: readString(data.notes),
  };
}
