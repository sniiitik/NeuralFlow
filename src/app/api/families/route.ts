import { NextResponse } from "next/server";
import { apiErrorResponse, readJson } from "@/lib/api-errors";
import { getPrisma } from "@/lib/prisma";
import { familyCreateSchema } from "@/lib/validation";

export async function GET() {
  try {
    const families = await getPrisma().modelFamily.findMany({ include: { versions: { select: { id: true, version: true, createdAt: true }, orderBy: { createdAt: "desc" } } }, orderBy: { name: "asc" } });
    return NextResponse.json({ families });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = familyCreateSchema.parse(await readJson(request));
    const family = await getPrisma().modelFamily.create({ data: input });
    return NextResponse.json({ family }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
