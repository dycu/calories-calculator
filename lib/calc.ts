import type { Ingredient, Meal } from "./types";

export function ingredientKcal(i: Ingredient): number | null {
  if (i.grams == null || i.kcalPer100g == null) return null;
  return (i.grams * i.kcalPer100g) / 100;
}

export interface MealTotals {
  /** Sum of kcal over ingredients that have both grams and kcal/100g. */
  totalKcal: number;
  /** True when every ingredient has grams and kcal/100g. */
  complete: boolean;
  ingredientsWeight: number;
  /** Whole-meal weight used for portions: the weighed total, or the sum of ingredients. */
  mealWeight: number;
  kcalPer100g: number | null;
}

export function mealTotals(meal: Meal): MealTotals {
  let totalKcal = 0;
  let complete = meal.ingredients.length > 0;
  let ingredientsWeight = 0;
  for (const i of meal.ingredients) {
    ingredientsWeight += i.grams ?? 0;
    const k = ingredientKcal(i);
    if (k == null) complete = false;
    else totalKcal += k;
  }
  const mealWeight = meal.totalWeight ?? ingredientsWeight;
  return {
    totalKcal,
    complete,
    ingredientsWeight,
    mealWeight,
    kcalPer100g: mealWeight > 0 && totalKcal > 0 ? (totalKcal / mealWeight) * 100 : null,
  };
}

/** Grams of the finished meal that contain `targetKcal`. */
export function gramsForKcal(totals: MealTotals, targetKcal: number): number | null {
  if (!totals.kcalPer100g || targetKcal <= 0) return null;
  return (targetKcal / totals.kcalPer100g) * 100;
}

export const round = (n: number, step = 1) => Math.round(n / step) * step;
