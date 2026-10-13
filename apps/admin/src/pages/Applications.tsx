import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { Empty, ErrorState, Loading, Notice, PageHeader } from '@/components/States';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { CATEGORY_LABELS, RELEVANCE_LABELS } from '@/lib/labels';
import type { Application } from '@/lib/types';

export function ApplicationsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const apps = useQuery({
    queryKey: ['applications', search],
    queryFn: () =>
      api.get<{ items: Application[] }>('/applications', { q: search }).then((r) => r.items),
  });
  const update = useMutation({
    mutationFn: (input: {
      id: string;
      patch: Partial<Pick<Application, 'category' | 'workRelevance'>>;
    }) => api.patch<Application>(`/applications/${input.id}`, input.patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });
  const canManage = can('applications.manage');

  return (
    <>
      <PageHeader
        title="Dasturlar"
        description="Agentlar uchratgan dasturlar. Kategoriya va ish bilan bog‘liqlik hisobotlarda ishlatiladi."
      />
      {update.isError ? (
        <Notice tone="error" className="mb-4">
          {errorMessage(update.error)}
        </Notice>
      ) : null}
      <Card>
        <div className="border-b border-line p-4">
          <Input
            className="max-w-sm"
            placeholder="Dastur nomi bo‘yicha qidirish"
            aria-label="Qidirish"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {apps.isPending ? (
          <Loading />
        ) : apps.isError ? (
          <ErrorState error={apps.error} onRetry={() => void apps.refetch()} />
        ) : apps.data.length === 0 ? (
          <Empty
            title="Dasturlar yo‘q"
            hint="Agentlar ma’lumot yuborgach, dasturlar shu yerda paydo bo‘ladi."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Dastur</Th>
                <Th>Jarayon</Th>
                <Th>Kategoriya</Th>
                <Th>Ish bilan bog‘liqligi</Th>
              </tr>
            </thead>
            <tbody>
              {apps.data.map((app) => (
                <tr key={app.id}>
                  <Td className="font-medium">{app.displayName}</Td>
                  <Td className="font-mono text-xs text-muted">{app.processName}</Td>
                  <Td>
                    {canManage ? (
                      <Select
                        aria-label={`${app.displayName} — kategoriya`}
                        className="h-8 w-44"
                        value={app.category}
                        onChange={(e) =>
                          update.mutate({ id: app.id, patch: { category: e.target.value } })
                        }
                      >
                        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      CATEGORY_LABELS[app.category]
                    )}
                  </Td>
                  <Td>
                    {canManage ? (
                      <Select
                        aria-label={`${app.displayName} — ish bilan bog‘liqligi`}
                        className="h-8 w-44"
                        value={app.workRelevance}
                        onChange={(e) =>
                          update.mutate({ id: app.id, patch: { workRelevance: e.target.value } })
                        }
                      >
                        {Object.entries(RELEVANCE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      RELEVANCE_LABELS[app.workRelevance]
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
