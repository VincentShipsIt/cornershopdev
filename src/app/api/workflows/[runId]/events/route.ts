import { getRun } from "workflow/api";
import { assertImportWorkflowAccess } from "@/lib/workflow-access";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { runId } = await params;
  const importJobId = new URL(request.url).searchParams.get("importJobId");
  if (!(await assertImportWorkflowAccess(runId, importJobId))) {
    return Response.json({ error: "Workflow run not found" }, { status: 404 });
  }

  try {
    const run = await getRun(runId);
    const readable = run.getReadable();
    const encoder = new TextEncoder();
    const stream = (readable as unknown as ReadableStream).pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          const data =
            typeof chunk === "string" ? chunk : JSON.stringify(chunk);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        },
      }),
    );

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return Response.json(
      { error: "Workflow run not found" },
      { status: 404 },
    );
  }
}
