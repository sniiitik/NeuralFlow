import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJson } from "@/lib/api-errors";
import { archiveModel, getModel } from "@/lib/registry";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    return NextResponse.json({ model: await getModel((await params).id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    z.object({ status: z.literal("archived") }).parse(await readJson(request));
    return NextResponse.json({ model: await archiveModel((await params).id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

// Delete is a soft archive: immutable version records remain available for audit.
export async function DELETE(_request: Request, { params }: Context) {
  try {
    return NextResponse.json({ model: await archiveModel((await params).id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
