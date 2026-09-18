import { ensureTwinStoreReady } from "@/lib/twin/twin-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await ensureTwinStoreReady();

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (data: unknown) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      send({ ...store.getSnapshot(), symbology: store.getSymbology() });

      const unsub = store.subscribe((snap) => {
        send({ ...snap, symbology: store.getSymbology() });
      });

      const keepAlive = setInterval(() => {
        controller.enqueue(enc.encode(": keepalive\n\n"));
      }, 15000);

      cleanup = () => {
        unsub();
        clearInterval(keepAlive);
      };
    },
    cancel() {
      cleanup?.();
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
