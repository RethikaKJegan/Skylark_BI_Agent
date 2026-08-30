import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skylark BI Agent",
  description: "Conversational BI for Monday.com deal and work-order boards",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
