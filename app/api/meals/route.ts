import { isMeal, listMeals, saveMeals } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ meals: await listMeals() });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Bulk upload, used once to move meals saved in the browser onto the server. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const meals: unknown[] = Array.isArray(body?.meals) ? body.meals : [];
  if (!meals.every(isMeal)) return Response.json({ error: "Invalid meals." }, { status: 400 });
  try {
    await saveMeals(meals);
    return Response.json({ ok: true, count: meals.length });
  } catch (e) {
    return errorResponse(e);
  }
}
