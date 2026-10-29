import { NUTRIENTS, type Ingredient, type Meal, type NutrientKey, type Nutrients } from "./types";

export const emptyNutrients = (): Nutrients =>
  Object.fromEntries(NUTRIENTS.map((n) => [n.key, null])) as Nutrients;

export const missingNutrients = (i: Ingredient): NutrientKey[] =>
  NUTRIENTS.map((n) => n.key).filter((k) => i.per100g[k] == null);

export function ingredientAmount(i: Ingredient, key: NutrientKey): number | null {
  const v = i.per100g[key];
  return i.grams == null || v == null ? null : (i.grams * v) / 100;
}

export interface MealTotals {
  /** Sum over ingredients that have both grams and a value for the nutrient. */
  total: Record<NutrientKey, number>;
  /** Nutrients for which some ingredient lacks grams or a value, so the total is too low. */
  incomplete: Set<NutrientKey>;
  /** Nutrients with at least one known value. */
  known: Set<NutrientKey>;
  ingredientsWeight: number;
  /** The weighed finished meal, or the sum of ingredients when not weighed. */
  mealWeight: number;
}

export function mealTotals(meal: Meal): MealTotals {
  const total = Object.fromEntries(NUTRIENTS.map((n) => [n.key, 0])) as Record<NutrientKey, number>;
  const incomplete = new Set<NutrientKey>();
  const known = new Set<NutrientKey>();
  let ingredientsWeight = 0;
  for (const i of meal.ingredients) {
    ingredientsWeight += i.grams ?? 0;
    for (const { key } of NUTRIENTS) {
      const a = ingredientAmount(i, key);
      if (a == null) incomplete.add(key);
      else {
        total[key] += a;
        known.add(key);
      }
    }
  }
  return { total, incomplete, known, ingredientsWeight, mealWeight: meal.totalWeight ?? ingredientsWeight };
}

export function per100gOfMeal(t: MealTotals, key: NutrientKey): number | null {
  return t.known.has(key) && t.mealWeight > 0 ? (t.total[key] / t.mealWeight) * 100 : null;
}

export const round = (n: number, step = 1) => Math.round(n / step) * step;

/** kcal as whole numbers, salt to 0.01 g, other grams to 0.1 g; Polish decimal comma. */
export function fmt(key: NutrientKey, v: number): string {
  if (key === "kcal") return String(Math.round(v));
  const s = key === "salt" ? round(v, 0.01).toFixed(2) : round(v, 0.1).toFixed(1);
  return s.replace(/\.0+$/, "").replace(".", ",");
}
