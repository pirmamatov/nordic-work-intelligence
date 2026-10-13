import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Empty, ErrorState, Loading, PageHeader } from '@/components/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { Table, Td, Th } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { ACTION_LABELS, OUTCOME_LABELS } from '@/lib/labels';
import type { AuditLog, Page } from '@/lib/types';

const GROUPS = [
  { value: '', label: 'Barcha amallar' },
  { value: 'auth.', label: 'Kirish va xavfsizlik' },
  { value: 'user.', label: 'Foydalanuvchilar' },
  { value: 'department.', label: 'Bo‘limlar' },
  { value: 'policy.', label: 'Monitoring siyosati' },
  { value: 'agent.', label: 'Agentlar' },
  { value: 'screenshot.', label: 'Ekran tasvirlari' },
  { value: 'application.', label: 'Dasturlar' },
  { value: 'retention.', label: 'Saqlash muddati' },
];

export function AuditPage() {
  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState('');
  const logs = useInfiniteQuery({
    queryKey: ['audit', { action, outcome }],
    queryFn: ({ pageParam }) =>
      api.get<Page<AuditLog>>('/audit-logs', { action, outcome, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = logs.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="Audit jurnali"
        description="Tizimdagi muhim amallar. Yozuvlarni o‘zgartirish yoki o‘chirish mumkin emas."
      />
      <Card>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-3">
          <Select aria-label="Amal turi" value={action} onChange={(e) => setAction(e.target.value)}>
            {GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Natija" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">Barcha natijalar</option>
            {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        {logs.isPending ? (
          <Loading />
        ) : logs.isError ? (
          <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
        ) : rows.length === 0 ? (
          <Empty title="Yozuv topilmadi" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Vaqt</Th>
                  <Th>Kim</Th>
                  <Th>Amal</Th>
                  <Th>Natija</Th>
                  <Th>Obyekt</Th>
                  <Th>IP</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((log) => (
                  <tr key={log.id}>
                    <Td className="whitespace-nowrap">{formatDateTime(log.occurredAt)}</Td>
                    <Td>
                      {log.actorUser ? (
                        <>
                          {log.actorUser.fullName}
                          <p className="text-xs text-muted">{log.actorUser.email}</p>
                        </>
                      ) : log.actorAgentId ? (
                        'Agent'
                      ) : (
                        'Tizim'
                      )}
                    </Td>
                    <Td>
                      {ACTION_LABELS[log.action] ?? log.action}
                      <p className="font-mono text-xs text-muted">{log.action}</p>
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          log.outcome === 'SUCCESS'
                            ? 'success'
                            : log.outcome === 'DENIED'
                              ? 'warn'
                              : 'danger'
                        }
                      >
                        {OUTCOME_LABELS[log.outcome]}
                      </Badge>
                    </Td>
                    <Td className="text-xs text-muted">
                      {log.entityType ?? '—'}
                      {log.entityId ? (
                        <p className="font-mono">{log.entityId.slice(0, 13)}…</p>
                      ) : null}
                    </Td>
                    <Td className="font-mono text-xs">{log.ip ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {logs.hasNextPage ? (
              <div className="p-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => void logs.fetchNextPage()}
                  loading={logs.isFetchingNextPage}
                >
                  Yana ko‘rsatish
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
