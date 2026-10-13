import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Empty, ErrorState, Loading, PageHeader } from '@/components/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { NotificationRow, Page } from '@/lib/types';

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      api.get<Page<NotificationRow> & { unreadCount: number }>('/notifications', { limit: 50 }),
    refetchInterval: 60_000,
  });
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const notifications = useNotifications();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: invalidate,
  });
  const read = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });

  return (
    <>
      <PageHeader
        title="Bildirishnomalar"
        action={
          (notifications.data?.unreadCount ?? 0) > 0 ? (
            <Button variant="outline" loading={readAll.isPending} onClick={() => readAll.mutate()}>
              Hammasini o‘qilgan deb belgilash
            </Button>
          ) : null
        }
      />
      <Card>
        {notifications.isPending ? (
          <Loading />
        ) : notifications.isError ? (
          <ErrorState error={notifications.error} onRetry={() => void notifications.refetch()} />
        ) : notifications.data.items.length === 0 ? (
          <Empty title="Bildirishnoma yo‘q" />
        ) : (
          <ul className="divide-y divide-line">
            {notifications.data.items.map((n) => (
              <li
                key={n.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {n.title} {n.readAt ? null : <Badge tone="success">Yangi</Badge>}
                  </p>
                  {n.body ? <p className="truncate text-sm text-muted">{n.body}</p> : null}
                  <p className="text-xs text-muted">{formatDateTime(n.createdAt)}</p>
                </div>
                {n.link ? (
                  <Link
                    to={n.link}
                    className="text-sm text-primary underline"
                    onClick={() => !n.readAt && read.mutate(n.id)}
                  >
                    Ochish
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
