import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { catalog } from "@/modules/store/catalog";

// Keep the public read independent of authentication, checkout and owner commands.
export async function GET() {
  try {
    return NextResponse.json(
      { products: await catalog(db) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Catalog unavailable", {
      code:
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : "unknown",
    });
    return NextResponse.json(
      {
        code: "CATALOG_UNAVAILABLE",
        message: "Products could not be loaded. Please retry in a moment.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
