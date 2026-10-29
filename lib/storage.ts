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
    createdAt: new Date().toISOString(),
    ingredients: [],
    totalWeight: null,
    aiNotes: "",
    calculatedAt: null,
    targetKcal: null,
  };
}
