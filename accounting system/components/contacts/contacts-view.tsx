"use client"

import { useState } from "react"
import { Pencil } from "lucide-react"
import { useAccounting } from "@/lib/accounting/store"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Amount } from "@/components/amount"
import { NewContactDialog } from "./new-contact-dialog"
import { formatCurrency, invoiceTotal } from "@/lib/accounting/utils"
import type { ContactType } from "@/lib/accounting/types"

const PARTY_LABEL: Record<ContactType, string> = {
  client: "AR Customer",
  vendor: "AP Vendor",
}

const EMPTY_LABEL: Record<ContactType, string> = {
  client: "Accounts Receivable customers",
  vendor: "Accounts Payable vendors",
}

function ContactGrid({ type }: { type: ContactType }) {
  const { contacts, invoices } = useAccounting()
  const filtered = contacts.filter((c) => c.type === type)

  if (filtered.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No {EMPTY_LABEL[type]} yet. Add one to get started.
      </p>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filtered.map((contact) => {
        const receivableInvoices = type === "client" ? invoices.filter((inv) => inv.clientId === contact.id) : []
        const outstanding = receivableInvoices
          .filter((inv) => inv.status !== "paid")
          .reduce((sum, inv) => sum + invoiceTotal(inv), 0)

        return (
          <Card key={contact.id}>
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-card-foreground">{contact.name}</p>
                  {contact.email ? (
                    <p className="truncate text-sm text-muted-foreground">{contact.email}</p>
                  ) : null}
                </div>
                <Badge variant="secondary" className="shrink-0 capitalize">
                  {PARTY_LABEL[contact.type]}
                </Badge>
              </div>
              {contact.phone || contact.taxId || typeof contact.creditLimit === "number" ? (
                <div className="space-y-1 text-xs text-muted-foreground">
                  {contact.phone ? <p>{contact.phone}</p> : null}
                  {contact.taxId ? <p>Tax ID: {contact.taxId}</p> : null}
                  {typeof contact.creditLimit === "number" ? <p>AR credit limit: {formatCurrency(contact.creditLimit)}</p> : null}
                </div>
              ) : null}
              {contact.addressLines?.length ? (
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  {contact.addressLines.slice(0, 4).map((line, index) => (
                    <p key={`${contact.id}-address-${index}`} className="truncate">{line}</p>
                  ))}
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                {type === "client" ? (
                  <>
                    <span className="text-muted-foreground">
                      {receivableInvoices.length} AR invoice{receivableInvoices.length === 1 ? "" : "s"}
                    </span>
                    {outstanding > 0 ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">AR balance</span>
                        <Amount value={outstanding} className="font-medium" />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">AR settled</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">AP bill tracking pending</span>
                )}
                <NewContactDialog
                  defaultType={type}
                  contact={contact}
                  trigger={
                    <Button size="sm" variant="outline">
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                  }
                />
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export function ContactsView() {
  const [tab, setTab] = useState<ContactType>("client")

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as ContactType)} className="gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="client">Accounts Receivable</TabsTrigger>
          <TabsTrigger value="vendor">Accounts Payable</TabsTrigger>
        </TabsList>
        <NewContactDialog defaultType={tab} />
      </div>
      <TabsContent value="client" className="mt-0">
        <ContactGrid type="client" />
      </TabsContent>
      <TabsContent value="vendor" className="mt-0">
        <ContactGrid type="vendor" />
      </TabsContent>
    </Tabs>
  )
}
