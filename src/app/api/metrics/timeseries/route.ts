import { generateTimeSeries } from "@/lib/metrics";
import { apiErrorResponse } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requested = Number(url.searchParams.get("minutes") ?? 30);
    const minutes = Number.isInteger(requested) ? Math.max(12, Math.min(requested, 120)) : 30;
    return Response.json({ series: await generateTimeSeries(minutes) });
  } catch (error) { return apiErrorResponse(error); }
}
