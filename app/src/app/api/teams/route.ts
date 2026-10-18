import { NextResponse, type NextRequest } from "next/server";
import { dbMissing } from "@/lib/db";
import { searchTeams } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "10", 10) || 10, 1), 30);
  if (dbMissing()) return NextResponse.json({ teams: [] });
  return NextResponse.json({ teams: searchTeams(q, limit) }, { headers: { "cache-control": "no-store" } });
}
