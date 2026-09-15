import { NextResponse } from "next/server";
import { answerQuestion } from "../../../../lib/cnx/rag";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  if (!q || q.length < 2) {
    return NextResponse.json({ error: "Query string 'q' must be at least 2 characters" }, { status: 400 });
  }
  const result = await answerQuestion(q);
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}