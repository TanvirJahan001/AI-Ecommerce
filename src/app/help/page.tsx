import Link from "next/link";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function Help() {
  const pages = (await db.query("select * from store_content order by slug"))
    .rows;
  return (
    <main className="shell section">
      <Link href="/">Store</Link>
      <h1>Store information</h1>
      {pages.length ? (
        pages.map((p) => (
          <section className="card" key={p.slug}>
            <h2>{p.title}</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{p.body}</p>
            <small>Policy version {p.version}</small>
          </section>
        ))
      ) : (
        <p>
          Business contact, shipping, return, privacy and warranty policies have
          not been approved for commercial launch.
        </p>
      )}
    </main>
  );
}
