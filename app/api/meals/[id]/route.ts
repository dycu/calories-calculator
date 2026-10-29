import { deleteMeal, isMeal, saveMeals } from "@/lib/db";
import { errorResponse } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const meal = await req.json().catch(() => null);
  if (!isMeal(meal) || meal.id !== id) return Response.json({ error: "Invalid meal." }, { status: 400 });
  try {
    await saveMeals([meal]);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await deleteMeal(id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
