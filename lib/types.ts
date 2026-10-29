export type KcalSource = "manual" | "label" | "estimate" | "saved";

export interface Ingredient {
  id: string;
  name: string;
  grams: number | null;
  kcalPer100g: number | null;
  kcalSource: KcalSource | null;
  /** Short explanation from the AI (e.g. "read from label", "assumed dry pasta"). */
  note: string;
  /** The user will attach a package / nutrition-label photo in the AI chat. */
  hasPhoto: boolean;
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
  targetKcal: number | null;
  /** Ingredient ids in the order they were numbered in the last copied prompt. */
  promptIds?: string[];
}

/** What the AI is asked to return (pasted back into the app). */
export interface AiResult {
  ingredients: { n: number; kcalPer100g: number; source: "label" | "estimate"; note: string }[];
  notes: string;
}
