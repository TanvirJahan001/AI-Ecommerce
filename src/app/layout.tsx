import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Mobile Accessories Store",
  description:
    "Shop mobile accessories with clear compatibility and specifications.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
