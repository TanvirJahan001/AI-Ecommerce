import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertDatabaseSchema } from "@/lib/database-config";
export async function GET() {
  try {
    await assertDatabaseSchema(db);
    return NextResponse.json({ status: "ok", database: "ok" });
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "unavailable" },
      { status: 503 },
    );
  }
}
