import { NextRequest, NextResponse } from "next/server";
import { requireOwner, AccessError } from "@/lib/auth-access";
import { db } from "@/lib/db";
export async function GET(req: NextRequest) {
  try {
    const user = await requireOwner(req.headers);
    const rows = (
      await db.query(
        "select id,status,total_minor,created_at from orders order by created_at desc limit 10000",
      )
    ).rows;
    await db.query(
      "insert into audit_events(actor_id,action,entity_type,reason) values($1,'report.export','order','Owner CSV export, no contact/address fields')",
      [user.user.id],
    );
    return new Response(
      "order_id,status,total_minor,created_at\n" +
        rows
          .map((r) =>
            [
              r.id,
              r.status,
              r.total_minor,
              new Date(r.created_at).toISOString(),
            ].join(","),
          )
          .join("\n"),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="orders.csv"',
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof AccessError ? e.code : "EXPORT_FAILED" },
      { status: e instanceof AccessError ? e.status : 500 },
    );
  }
}
