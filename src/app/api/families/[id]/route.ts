import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError, readJson } from "@/lib/api-errors";
import { getPrisma } from "@/lib/prisma";
import { familyUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const family = await getPrisma().modelFamily.findUnique({ where: { id: (await params).id }, include: { versions: { select: { id: true, version: true, createdAt: true }, orderBy: { createdAt: "desc" } } } });
    if (!family) throw new ApiError(404, "family_not_found", "Model family not found.");
    return NextResponse.json({ family });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const input = familyUpdateSchema.parse(await readJson(request));
    const family = await getPrisma().modelFamily.update({ where: { id: (await params).id }, data: input });
    return NextResponse.json({ family });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const id = (await params).id;
    const count = await getPrisma().modelVersion.count({ where: { familyId: id } });
    if (count > 0) throw new ApiError(409, "family_has_versions", "Archive versions before retiring this family; version history is retained.");
    await getPrisma().modelFamily.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
