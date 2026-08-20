"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useAccounting } from "@/lib/accounting/store"

export function AuditView() {
  const { auditLogs } = useAccounting()

  if (auditLogs.length === 0) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">No audit events recorded yet.</Card>
  }

  return (
    <div className="space-y-3">
      {auditLogs.map((log) => (
        <Card key={log.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{log.action}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{log.entityType}{log.entityId ? `:${log.entityId}` : ""}</span>
              </div>
              <p className="mt-2 text-sm">{log.impactSummary}</p>
              {log.reason ? <p className="mt-1 text-xs text-muted-foreground">Reason: {log.reason}</p> : null}
            </div>
            <span className="font-mono text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString("en-MY")}</span>
          </div>
        </Card>
      ))}
    </div>
  )
}
