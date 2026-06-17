import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jill Procurement Agent",
  description: "Autonomous RFQ execution for tactical procurement workflows"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
