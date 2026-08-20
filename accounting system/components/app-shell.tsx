"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, type ReactNode } from "react"
import {
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  ReceiptText,
  BarChart3,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/journal", label: "Journal", icon: ReceiptText },
  { href: "/receivable", label: "Receivable", icon: FileText },
  { href: "/payable", label: "Payable", icon: CircleDollarSign },
  { href: "/stock", label: "Stock", icon: Package },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
]

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-mono text-sm font-bold">
        L
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-sidebar-foreground">Ledger</p>
        <p className="text-[11px] text-sidebar-foreground/60">Double-entry accounting</p>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex min-h-svh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-6 bg-sidebar p-3 md:flex">
        <div className="pt-2">
          <Brand />
        </div>
        <NavList />
        <div className="mt-auto rounded-md bg-sidebar-accent/40 p-3 text-[11px] leading-relaxed text-sidebar-foreground/60">
          Database mode &middot; accounting records persist in PostgreSQL.
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button variant="outline" size="icon" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              }
            />
            <SheetContent side="left" className="w-64 bg-sidebar p-3">
              <div className="pb-4 pt-1">
                <Brand />
              </div>
              <NavList onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-sidebar text-sidebar-primary-foreground font-mono text-xs font-bold">
              L
            </div>
            <span className="text-sm font-semibold">Ledger</span>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
