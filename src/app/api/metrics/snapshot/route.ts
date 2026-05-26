import { generateSnapshot } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(generateSnapshot());
}
