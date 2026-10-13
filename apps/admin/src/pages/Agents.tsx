import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Empty, ErrorState, Loading, PageHeader } from '@/components/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, Td, Th } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AgentRow, Page } from '@/lib/types';

export function AgentsPage() {
  const agents = useInfiniteQuery({
    queryKey: ['agents', 'list'],
    queryFn: ({ pageParam }) =>
      api.get<Page<AgentRow>>('/agents', { cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: 60_000,
  });
  const rows = agents.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="Agentlar"
        description="Xodimlar kompyuteriga o‘rnatilgan agentlar. Yangi agent xodim profilidagi “Agent” bo‘limida ro‘yxatdan o‘tkaziladi."
      />
      <Card>
        {agents.isPending ? (
          <Loading />
        ) : agents.isError ? (
          <ErrorState error={agents.error} onRetry={() => void agents.refetch()} />
        ) : rows.length === 0 ? (
          <Empty title="Hali birorta agent ro‘yxatdan o‘tmagan" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Xodim</Th>
                  <Th>Bo‘lim</Th>
                  <Th>Kompyuter</Th>
                  <Th>Holat</Th>
                  <Th>Versiya</Th>
                  <Th>Oxirgi aloqa</Th>
                  <Th>Yuborilmagan yozuvlar</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <Td className="font-medium">{a.workstation.employee.user.fullName}</Td>
                    <Td>{a.workstation.employee.department?.name ?? '—'}</Td>
                    <Td>
                      {a.workstation.hostname}
                      <p className="text-xs text-muted">{a.workstation.osVersion}</p>
                    </Td>
                    <Td>
                      {a.status === 'REVOKED' ? (
                        <Badge tone="danger">Bekor qilingan</Badge>
                      ) : a.online ? (
                        <Badge tone="success">Onlayn</Badge>
                      ) : (
                        <Badge tone="warn">Oflayn</Badge>
                      )}
                    </Td>
                    <Td>{a.agentVersion}</Td>
                    <Td className="whitespace-nowrap">{formatDateTime(a.lastSeenAt)}</Td>
                    <Td>{a.queueDepth ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {agents.hasNextPage ? (
              <div className="p-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => void agents.fetchNextPage()}
                  loading={agents.isFetchingNextPage}
                >
                  Yana ko‘rsatish
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Agent 3 daqiqa aloqaga chiqmasa “Oflayn” hisoblanadi. Bu kompyuter o‘chiq, tarmoq yo‘q yoki
        agent to‘xtatilganini bildirishi mumkin.{' '}
        <Link to="/xodimlar" className="underline">
          Xodimlar ro‘yxati
        </Link>
      </p>
    </>
  );
}
