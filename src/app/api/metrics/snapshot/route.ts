import { generateSnapshot } from "@/lib/metrics";
import { apiErrorResponse } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await generateSnapshot());
  } catch (error) {
    return apiErrorResponse(error);
  }
}
