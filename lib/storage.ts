import { get, set } from "idb-keyval";
import type { Meal } from "./types";

// IndexedDB: survives reloads, no size worries as the meal history grows.
const KEY = "meals-v1";

export async function loadMeals(): Promise<Meal[]> {
  return (await get<Meal[]>(KEY)) ?? [];
}

export async function saveMeals(meals: Meal[]): Promise<void> {
  await set(KEY, meals);
}

export const newId = () => crypto.randomUUID();

export function newMeal(): Meal {
  return {
    id: newId(),
    name: "",
    description: "",
    createdAt: new Date().toISOString(),
    ingredients: [],
    totalWeight: null,
    aiNotes: "",
    calculatedAt: null,
    targetKcal: null,
  };
}

/**
 * A fresh meal based on one made before: same name, notes and ingredients
 * (with their kcal/100 g, so no need to ask the AI again). The finished
 * weight is cleared because it changes every time you cook.
 */
export function mealFromPrevious(src: Meal): Meal {
  return {
    ...newMeal(),
    name: src.name,
    description: src.description ?? "",
    targetKcal: src.targetKcal,
    ingredients: src.ingredients.map((i) => ({ ...i, id: newId(), hasPhoto: false })),
  };
}

const mealKey = (m: Meal) => m.name.trim().toLowerCase();

/** The latest version of each distinctly named meal that has ingredients (input is newest first). */
export function previousMeals(meals: Meal[], excludeId?: string): Meal[] {
  const seen = new Set<string>();
  return meals.filter((m) => {
    const key = mealKey(m);
    if (m.id === excludeId || !key || m.ingredients.length === 0 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function findPrevious(meals: Meal[], meal: Meal): Meal | undefined {
  const key = mealKey(meal);
  return key ? previousMeals(meals, meal.id).find((m) => mealKey(m) === key) : undefined;
}
