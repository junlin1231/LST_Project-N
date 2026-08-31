"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type CompanyRole = "owner" | "admin" | "accountant" | "approver" | "viewer"

export interface CompanySummary {
  id: string
  name: string
  baseCurrency: string
  role: CompanyRole
  isActive: boolean
}

interface CompanyStore {
  companies: CompanySummary[]
  activeCompany: CompanySummary | null
  loading: boolean
  switchCompany: (companyId: string) => Promise<void>
  refreshCompanies: () => Promise<void>
}

const CompanyContext = createContext<CompanyStore | null>(null)

async function fetchCompanies() {
  const response = await fetch("/api/companies", { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`Failed to load companies: ${response.status}`)
  }
  return response.json() as Promise<CompanySummary[]>
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<CompanySummary[]>([])
  const [loading, setLoading] = useState(true)

  const refreshCompanies = useCallback(async () => {
    setLoading(true)
    try {
      setCompanies(await fetchCompanies())
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshCompanies()
  }, [refreshCompanies])

  const switchCompany = useCallback(async (companyId: string) => {
    const response = await fetch("/api/companies/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error ?? `Failed to switch company: ${response.status}`)
    }
    await refreshCompanies()
  }, [refreshCompanies])

  const activeCompany = useMemo(() => companies.find((company) => company.isActive) ?? companies[0] ?? null, [companies])

  return (
    <CompanyContext.Provider value={{ companies, activeCompany, loading, switchCompany, refreshCompanies }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany() {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error("useCompany must be used within CompanyProvider")
  return ctx
}
