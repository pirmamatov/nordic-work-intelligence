import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { TASK_PRIORITIES, TASK_STATUSES, type TaskStatus } from '@nwi/shared';
import { z } from 'zod';
import { Empty, ErrorState, Loading, Notice, PageHeader } from '@/components/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/labels';
import type { Criterion, Page, TaskDetail, TaskListItem, User } from '@/lib/types';

export function statusTone(status: TaskStatus): 'neutral' | 'success' | 'danger' | 'warn' {
  if (status === 'DONE' || status === 'APPROVED') return 'success';
  if (status === 'NEEDS_FIX' || status === 'DELAYED') return 'warn';
  if (status === 'CANCELLED') return 'danger';
  return 'neutral';
}

export function useCriteria() {
  return useQuery({
    queryKey: ['criteria'],
    queryFn: () => api.get<{ items: Criterion[]; canManage: boolean }>('/accreditation/criteria'),
  });
}

/** Topshiriq biriktirish mumkin bo'lgan xodimlar (server doira bo'yicha cheklaydi). */
function useAssignableEmployees(enabled: boolean) {
  return useQuery({
    queryKey: ['users', 'assignable'],
    queryFn: () => api.get<Page<User>>('/users', { limit: 100, isActive: true }),
    enabled,
    select: (page) =>
      page.items.flatMap((u) => (u.employee ? [{ id: u.employee.id, fullName: u.fullName }] : [])),
  });
}

// Forma maydonlari: sana `YYYY-MM-DD` ko'rinishida kiritiladi va kun oxiriga aylantiriladi.
const formSchema = z.object({
  title: z.string().trim().min(3, 'Topshiriq nomini kiriting').max(300),
  description: z.string().trim().max(8000),
  ownerId: z.string().min(1, 'Mas’ul xodimni tanlang'),
  criterionId: z.string(),
  dueDate: z.string().min(1, 'Muddatni kiriting'),
  priority: z.enum(TASK_PRIORITIES),
  expectedResult: z.string().trim().max(4000),
});
type FormValues = z.infer<typeof formSchema>;

function CreateTaskDialog(props: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const employees = useAssignableEmployees(true);
  const criteria = useCriteria();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      ownerId: '',
      criterionId: '',
      dueDate: '',
      priority: 'MEDIUM',
      expectedResult: '',
    },
  });
  const create = useMutation({
    mutationFn: (v: FormValues) =>
      api.post<TaskDetail>('/tasks', {
        title: v.title,
        description: v.description,
        ownerId: v.ownerId,
        criterionId: v.criterionId || null,
        // Muddat tanlangan kunning oxiri (mahalliy vaqt bilan).
        dueAt: new Date(`${v.dueDate}T23:59:59`).toISOString(),
        priority: v.priority,
        expectedResult: v.expectedResult,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      props.onClose();
    },
  });
  const errors = form.formState.errors;

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()} title="Yangi topshiriq" wide>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
        noValidate
      >
        {create.isError ? <Notice tone="error">{errorMessage(create.error)}</Notice> : null}
        <Field label="Topshiriq nomi" htmlFor="task-title" error={errors.title?.message}>
          <Input id="task-title" {...form.register('title')} />
        </Field>
        <Field label="Tavsif" htmlFor="task-description" error={errors.description?.message}>
          <Textarea id="task-description" {...form.register('description')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mas’ul xodim" htmlFor="task-owner" error={errors.ownerId?.message}>
            <Select id="task-owner" {...form.register('ownerId')}>
              <option value="">— Tanlang —</option>
              {employees.data?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Akkreditatsiya mezoni" htmlFor="task-criterion">
            <Select id="task-criterion" {...form.register('criterionId')}>
              <option value="">— Bog‘lanmagan —</option>
              {criteria.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Muddat" htmlFor="task-due" error={errors.dueDate?.message}>
            <Input id="task-due" type="date" {...form.register('dueDate')} />
          </Field>
          <Field label="Ustuvorlik" htmlFor="task-priority">
            <Select id="task-priority" {...form.register('priority')}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="Kutilayotgan natija"
          htmlFor="task-result"
          error={errors.expectedResult?.message}
          hint="Topshiriq qachon bajarilgan hisoblanishini aniq yozing."
        >
          <Textarea id="task-result" {...form.register('expectedResult')} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={props.onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={create.isPending}>
            Yaratish
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function TasksPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const tasks = useInfiniteQuery({
    queryKey: ['tasks', { search, status, overdueOnly }],
    queryFn: ({ pageParam }) =>
      api.get<Page<TaskListItem> & { canCreate: boolean }>('/tasks', {
        q: search,
        status,
        overdue: overdueOnly || undefined,
        cursor: pageParam,
        limit: 25,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = tasks.data?.pages.flatMap((p) => p.items) ?? [];
  const canCreate = tasks.data?.pages[0]?.canCreate ?? false;

  return (
    <>
      <PageHeader
        title="Topshiriqlar"
        description="Topshiriq vakolatli shaxs natijani tasdiqlagandan keyingina bajarilgan hisoblanadi."
        action={
          canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Topshiriq qo‘shish
            </Button>
          ) : null
        }
      />
      <Card>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-muted"
              aria-hidden
            />
            <Input
              className="pl-9"
              placeholder="Nomi bo‘yicha qidirish"
              aria-label="Qidirish"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            aria-label="Holat"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus | '')}
          >
            <option value="">Barcha holatlar</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            Faqat muddati o‘tganlar
          </label>
        </div>
        {tasks.isPending ? (
          <Loading />
        ) : tasks.isError ? (
          <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
        ) : rows.length === 0 ? (
          <Empty
            title="Topshiriq topilmadi"
            hint="Filtrlarni o‘zgartirib ko‘ring yoki yangi topshiriq qo‘shing."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Topshiriq</Th>
                  <Th>Mas’ul</Th>
                  <Th>Mezon</Th>
                  <Th>Muddat</Th>
                  <Th>Ustuvorlik</Th>
                  <Th>Holat</Th>
                  <Th>Bajarilishi</Th>
                  <Th>Hujjatlar</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((task) => (
                  <tr key={task.id} className="hover:bg-surface/60">
                    <Td className="max-w-sm">
                      <Link
                        to={`/topshiriqlar/${task.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {task.title}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap">{task.owner.fullName}</Td>
                    <Td>{task.criterion?.code ?? '—'}</Td>
                    <Td className="whitespace-nowrap">
                      {formatDay(task.dueAt.slice(0, 10))}
                      {task.overdue ? (
                        <Badge tone="danger" className="ml-2">
                          <AlertTriangle className="h-3 w-3" aria-hidden /> Muddati o‘tgan
                        </Badge>
                      ) : null}
                    </Td>
                    <Td>{PRIORITY_LABELS[task.priority]}</Td>
                    <Td>
                      <Badge tone={statusTone(task.status)}>
                        {TASK_STATUS_LABELS[task.status]}
                      </Badge>
                    </Td>
                    <Td>{task.progressPct}%</Td>
                    <Td>{task.documentCount}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {tasks.hasNextPage ? (
              <div className="p-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => void tasks.fetchNextPage()}
                  loading={tasks.isFetchingNextPage}
                >
                  Yana ko‘rsatish
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
      {creating ? <CreateTaskDialog onClose={() => setCreating(false)} /> : null}
    </>
  );
}
