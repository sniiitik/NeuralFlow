import { generateSnapshot } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = async () => {
        try {
          const snapshot = await generateSnapshot();
          if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`));
        } catch (error) {
          console.error("Metrics stream error", error);
          if (!closed) controller.enqueue(encoder.encode(`event: error\ndata: {"error":"Metrics unavailable"}\n\n`));
        }
      };

      void send();
      timer = setInterval(() => { void send(); }, 2000);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
