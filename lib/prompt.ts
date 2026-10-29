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
      `${idx + 1}. ${ing.name.trim()} — ${ing.grams ?? "?"} g${ing.hasPhoto ? " (dołączam zdjęcie opakowania)" : ""}`,
  );

  return `Liczę wartości odżywcze domowego posiłku${mealName.trim() ? ` („${mealName.trim()}”)` : ""}. Dla każdego składnika poniżej podaj wartości odżywcze na 100 g (w takiej postaci, w jakiej był ważony): wartość energetyczną (kcal), tłuszcz, kwasy tłuszczowe nasycone, węglowodany, cukry, błonnik, białko i sól (wszystko w gramach oprócz energii).

${description.trim() ? `Notatki do przepisu: ${description.trim()}\n\n` : ""}Składniki:
${lines.join("\n")}
${
  photoRows.length
    ? `\nDołączam ${photoRows.length > 1 ? "zdjęcia opakowań" : "zdjęcie opakowania"} dla: ${photoRows
        .map(({ ing, n }) => `#${n} ${ing.name.trim()}`)
        .join(", ")}${photoRows.length > 1 ? " (w tej kolejności)" : ""}. Odczytaj wartości „w 100 g” z tabeli wartości odżywczych (jeśli energia jest tylko w kJ, podziel przez 4,184; jeśli podano tylko wartości na porcję, przelicz na 100 g). Ustaw source na "label".\n`
    : ""
}
Dla składników bez zdjęcia wyszukaj wartości w internecie: dla konkretnej marki lub produktu użyj strony producenta albo sklepu internetowego (np. Frisco, Auchan, Carrefour); dla zwykłych produktów użyj tabel składu żywności — najlepiej polskich (Tabele składu i wartości odżywczej żywności NIZP PZH / IŻŻ), ewentualnie USDA FoodData Central. Ustaw source na "web" i podaj nazwę strony w note. Tylko jeśli nie możesz przeszukać internetu, oprzyj się na własnej wiedzy i ustaw source na "estimate".

Zasady:
- Zakładaj, że składniki ważono na surowo / na sucho, chyba że nazwa mówi inaczej (np. „ugotowany ryż”); jeśli to ważne, wspomnij o założeniu w note.
- Jeśli wartości naprawdę nie da się ustalić, wpisz null zamiast zgadywać.
- Nie licz sum — rachunki zrobi aplikacja.
- Pisz note i notes po polsku. Klucze JSON i wartości source zostaw dokładnie jak we wzorze.

Odpowiedz wyłącznie tym JSON-em w bloku kodu, po jednym wpisie na składnik, gdzie "n" to numer składnika:
\`\`\`json
{"ingredients":[{"n":1,"kcal":0,"fat":0,"satFat":0,"carbs":0,"sugars":0,"fiber":0,"protein":0,"salt":0,"source":"label | web | estimate","note":"krótkie uzasadnienie / źródło"}],"notes":"krótkie uwagi ogólne albo pusty tekst"}
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
  if (start < 0 || end <= start) throw new Error("We wklejonej odpowiedzi nie ma JSON-a.");
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("Wklejona odpowiedź nie jest poprawnym JSON-em — skopiuj cały blok kodu od AI.");
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
  if (!Array.isArray(data.ingredients)) throw new Error("W odpowiedzi brakuje listy \"ingredients\".");
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
  if (ingredients.length === 0) throw new Error("W odpowiedzi nie ma użytecznych wartości składników.");
  return { ingredients, notes: readString(data.notes) };
}

/**
 * Build a prompt that turns photos of the ingredients into a whole recipe:
 * names, weights and nutrition. The meal name / notes, if already filled in,
 * are passed along as hints.
 */
export function buildRecipePrompt(mealName: string, description: string): string {
  const hints = [
    mealName.trim() && `Posiłek to „${mealName.trim()}”.`,
    description.trim() && `Moje notatki: ${description.trim()}`,
  ].filter(Boolean);

  return `W załączniku są zdjęcia składników posiłku, który gotuję. Na ich podstawie przygotuj listę składników przepisu.${
    hints.length ? `\n\n${hints.join("\n")}` : ""
  }

Dla każdego widocznego składnika:
- Nazwij go konkretnie, z marką / nazwą produktu, jeśli widać ją na opakowaniu.
- Waga w gramach, która trafia do posiłku: odczytaj ją z wyświetlacza wagi kuchennej, jeśli jest widoczny ("weight": "scale"); w przeciwnym razie użyj masy netto z opakowania, jeśli wygląda na to, że idzie całe opakowanie ("weight": "package"); w przeciwnym razie oszacuj na podstawie zdjęcia ("weight": "estimate").
- Wartości odżywcze na 100 g (w postaci, w jakiej jest ważony): wartość energetyczna (kcal), tłuszcz, kwasy tłuszczowe nasycone, węglowodany, cukry, błonnik, białko i sól (w gramach oprócz energii). Jeśli tabela wartości odżywczych jest czytelna na zdjęciu, użyj jej (source "label"; jeśli energia jest tylko w kJ, podziel przez 4,184; wartości na porcję przelicz na 100 g). W przeciwnym razie wyszukaj w internecie: strona producenta lub sklepu (np. Frisco, Auchan, Carrefour) dla produktów markowych, tabele składu żywności — najlepiej polskie (NIZP PZH / IŻŻ), ewentualnie USDA FoodData Central — dla zwykłych produktów (source "web", nazwa strony w note). Tylko jeśli nie możesz przeszukać internetu, oprzyj się na własnej wiedzy (source "estimate").

Zasady:
- Uwzględnij widoczny tłuszcz do smażenia, sosy i przyprawy; pomiń wodę z kranu.
- Zakładaj produkty surowe / suche, chyba że wyraźnie są ugotowane; założenia opisz w note.
- Jeśli wartości naprawdę nie da się ustalić, wpisz null.
- Zaproponuj też krótką nazwę posiłku i jednozdaniową notatkę do przepisu.
- Pisz nazwy, notatki i uwagi po polsku. Klucze JSON oraz wartości weight i source zostaw dokładnie jak we wzorze.

Odpowiedz wyłącznie tym JSON-em w bloku kodu:
\`\`\`json
{"name":"nazwa posiłku","description":"jednozdaniowa notatka do przepisu","ingredients":[{"name":"składnik","grams":0,"weight":"scale | package | estimate","kcal":0,"fat":0,"satFat":0,"carbs":0,"sugars":0,"fiber":0,"protein":0,"salt":0,"source":"label | web | estimate","note":"krótkie uzasadnienie / źródło"}],"notes":"krótkie uwagi ogólne albo pusty tekst"}
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
  if (ingredients.length === 0) throw new Error("W odpowiedzi nie znaleziono składników.");
  return {
    name: readString(data.name).trim(),
    description: readString(data.description).trim(),
    ingredients,
    notes: readString(data.notes),
  };
}
