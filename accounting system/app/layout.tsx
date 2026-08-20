import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { AccountingProvider } from "@/lib/accounting/store"
import { AppShell } from "@/components/app-shell"
import "./globals.css"

export const metadata: Metadata = {
  title: "Accounting System",
  description:
    "A double-entry accounting system for small businesses: general ledger, journal entries, Accounts Receivable, Accounts Payable parties, and financial statements.",
  generator: "v0.app",
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#3a3a6a",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className="font-sans antialiased">
        <AccountingProvider>
          <AppShell>{children}</AppShell>
        </AccountingProvider>
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
