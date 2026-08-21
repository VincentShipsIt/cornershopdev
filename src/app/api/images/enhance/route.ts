export const runtime = "nodejs";

export async function POST() {
  return Response.json(
    {
      error:
        "This endpoint was retired. Store and approve photos in the site photo library before enhancing them.",
    },
    { status: 410 },
  );
}
