import { generateTimeSeries } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const minutes = Number(url.searchParams.get("minutes") ?? 30);
  return Response.json({ series: generateTimeSeries(Math.max(12, Math.min(minutes, 120))) });
}
