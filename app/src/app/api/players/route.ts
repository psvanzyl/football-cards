import { NextResponse, type NextRequest } from "next/server";
import { dbMissing } from "@/lib/db";
import { readParams } from "@/lib/params";
import { listPlayers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { filters, sort, page, per } = readParams((k) => sp.get(k));
  if (dbMissing()) {
    return NextResponse.json(
      { total: 0, page: 1, per, pages: 1, sort, players: [], dbMissing: true },
      { status: 200 },
    );
  }
  const data = listPlayers(filters, sort, page, per);
  return NextResponse.json(data, {
    headers: { "cache-control": "no-store" },
  });
}
