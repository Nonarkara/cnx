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
  if (q.length > 500) {
    return NextResponse.json({ error: "Query exceeds 500 characters" }, { status: 400 });
  }
  try {
    const result = await answerQuestion(q);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The question index is unavailable right now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}