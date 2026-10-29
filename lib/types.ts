/** The values on an EU nutrition label, all per 100 g. */
export const NUTRIENTS = [
  { key: "kcal", label: "Energy", unit: "kcal" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "satFat", label: "of which saturates", unit: "g", sub: true },
  { key: "carbs", label: "Carbohydrates", unit: "g" },
  { key: "sugars", label: "of which sugars", unit: "g", sub: true },
  { key: "fiber", label: "Fibre", unit: "g" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "salt", label: "Salt", unit: "g" },
] as const;

export type NutrientKey = (typeof NUTRIENTS)[number]["key"];
export type Nutrients = Record<NutrientKey, number | null>;

/** Where the AI-provided values came from ("saved" = copied from an earlier meal). */
export type Source = "label" | "web" | "estimate" | "saved";

export interface Ingredient {
  id: string;
  name: string;
  grams: number | null;
  per100g: Nutrients;
  source: Source | null;
  /** Values the user typed in; the AI never overwrites these. */
  manual: NutrientKey[];
  /** Short explanation from the AI (e.g. "read from label", "assumed dry pasta"). */
  note: string;
  /** The user will attach a package / nutrition-label photo in the AI chat. */
  hasPhoto: boolean;
  /** The weight was guessed by the AI from a photo rather than weighed. */
  gramsEstimated?: boolean;
}

export interface Meal {
  id: string;
  name: string;
  /** Free-text recipe notes (how it's cooked, brands…); reused when making the meal again. */
  description?: string;
  createdAt: string;
  ingredients: Ingredient[];
  /** Weight of the whole finished meal in grams (e.g. after cooking). */
  totalWeight: number | null;
  aiNotes: string;
  calculatedAt: string | null;
  /** Ingredient ids in the order they were numbered in the last copied prompt. */
  promptIds?: string[];
}

/** What the AI is asked to return (pasted back into the app). */
export interface AiResult {
  ingredients: { n: number; values: Partial<Nutrients>; source: "label" | "web" | "estimate"; note: string }[];
  notes: string;
}
