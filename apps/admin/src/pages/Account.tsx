import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { ErrorState, Loading, Notice, PageHeader } from '@/components/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/labels';
import type { SessionRow } from '@/lib/types';
import { ChangePasswordForm, MfaSetupFlow } from './AuthScreens';

export function AccountPage() {
  const { me, refresh } = useAuth();
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<{ items: SessionRow[] }>('/auth/sessions').then((r) => r.items),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
  if (!me) return null;

  return (
    <>
      <PageHeader
        title="Hisobim"
        description={`${me.fullName} · ${me.email} · ${me.roles.map((r) => ROLE_LABELS[r]).join(', ')}`}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Parolni almashtirish" />
          <CardBody>
            <ChangePasswordForm
              onDone={() => queryClient.invalidateQueries({ queryKey: ['sessions'] })}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Ikki bosqichli tasdiqlash (MFA)" />
          <CardBody>
            {me.mfaEnabled ? (
              <div className="space-y-2">
                <Badge tone="success">Yoqilgan</Badge>
                <p className="text-sm text-muted">
                  Telefoningiz almashsa yoki yo‘qolsa, administratorga murojaat qiling — u MFA ni
                  tiklaydi.
                </p>
              </div>
            ) : (
              <MfaSetupFlow onDone={refresh} />
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Faol sessiyalar"
            description="Tanimagan sessiyani ko‘rsangiz, uni yoping va parolni almashtiring."
          />
          {revoke.isError ? (
            <CardBody>
              <Notice tone="error">{errorMessage(revoke.error)}</Notice>
            </CardBody>
          ) : null}
          {sessions.isPending ? (
            <Loading />
          ) : sessions.isError ? (
            <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Qurilma</Th>
                  <Th>IP</Th>
                  <Th>Kirgan vaqt</Th>
                  <Th>Oxirgi faollik</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {sessions.data.map((s) => (
                  <tr key={s.id}>
                    <Td className="max-w-xs truncate">{s.userAgent ?? '—'}</Td>
                    <Td className="font-mono text-xs">{s.ip ?? '—'}</Td>
                    <Td>{formatDateTime(s.createdAt)}</Td>
                    <Td>{formatDateTime(s.lastSeenAt)}</Td>
                    <Td className="text-right">
                      {s.current ? (
                        <Badge tone="success">Joriy</Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          loading={revoke.isPending && revoke.variables === s.id}
                          onClick={() => revoke.mutate(s.id)}
                        >
                          Yopish
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
