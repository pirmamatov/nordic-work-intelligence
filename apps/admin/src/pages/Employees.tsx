import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { createUserSchema, ROLE_CODES, type RoleCode } from '@nwi/shared';
import type { z } from 'zod';
import { useAuth } from '@/auth/AuthContext';
import { Empty, ErrorState, Loading, Notice, PageHeader } from '@/components/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { Table, Td, Th } from '@/components/ui/table';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDateTime, formatDuration, todayLocal } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/labels';
import type { AgentRow, Department, EmployeeSummaryRow, Page, Summary, User } from '@/lib/types';

type CreateForm = z.input<typeof createUserSchema>;

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<{ items: Department[] }>('/departments').then((r) => r.items),
  });
}

function CreateUserDialog(props: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const departments = useDepartments();
  const form = useForm<CreateForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      fullName: '',
      password: '',
      roles: ['EMPLOYEE'],
      employee: { departmentId: null, position: '' },
    },
  });
  const create = useMutation({
    mutationFn: (input: CreateForm) => api.post<User>('/users', input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      form.reset();
      props.onClose();
    },
    onError: (error) => {
      // Server qaytargan maydon xatolari forma maydonlariga bog'lanadi.
      if (error instanceof ApiError) {
        for (const d of error.details ?? [])
          form.setError(d.field as keyof CreateForm, { message: d.message });
      }
    },
  });
  const errors = form.formState.errors;

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => !open && props.onClose()}
      title="Yangi xodim"
      description="Xodim birinchi kirishda vaqtinchalik parolni o‘zinikiga almashtiradi."
    >
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
        noValidate
      >
        {create.isError ? <Notice tone="error">{errorMessage(create.error)}</Notice> : null}
        <Field label="Ism-familiya" htmlFor="fullName" error={errors.fullName?.message}>
          <Input id="fullName" {...form.register('fullName')} />
        </Field>
        <Field label="Elektron pochta" htmlFor="new-email" error={errors.email?.message}>
          <Input id="new-email" type="email" autoComplete="off" {...form.register('email')} />
        </Field>
        <Field
          label="Vaqtinchalik parol"
          htmlFor="new-password"
          error={errors.password?.message}
          hint="Kamida 12 ta belgi."
        >
          <Input id="new-password" type="text" autoComplete="off" {...form.register('password')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Bo‘lim"
            htmlFor="departmentId"
            error={errors.employee?.departmentId?.message}
          >
            <Select
              id="departmentId"
              {...form.register('employee.departmentId', { setValueAs: (v: string) => v || null })}
            >
              <option value="">— Tanlanmagan —</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lavozim" htmlFor="position" error={errors.employee?.position?.message}>
            <Input id="position" {...form.register('employee.position')} />
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Rollar</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ROLE_CODES.map((code) => (
              <label key={code} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  value={code}
                  className="h-4 w-4 accent-primary"
                  {...form.register('roles')}
                />
                {ROLE_LABELS[code]}
              </label>
            ))}
          </div>
          {errors.roles ? <p className="mt-1 text-xs text-danger">{errors.roles.message}</p> : null}
        </fieldset>
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

export function EmployeesPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [role, setRole] = useState<RoleCode | ''>('');
  const [creating, setCreating] = useState(false);
  const departments = useDepartments();
  const today = todayLocal();

  const users = useInfiniteQuery({
    queryKey: ['users', { search, departmentId, role }],
    queryFn: ({ pageParam }) =>
      api.get<Page<User>>('/users', {
        q: search,
        departmentId,
        role,
        cursor: pageParam,
        limit: 25,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  // Bugungi vaqt va agent holati alohida so'rovlar: ruxsat bo'lmasa ustunlar "—" bo'lib qoladi.
  const canSeeActivity = can('activity.view.all', 'activity.view.department');
  const activity = useQuery({
    queryKey: ['activity', 'by-employee', today],
    queryFn: () =>
      api.get<Summary<EmployeeSummaryRow>>('/activity/summary', {
        from: today,
        to: today,
        groupBy: 'employee',
      }),
    enabled: canSeeActivity,
    refetchInterval: 60_000,
  });
  const agents = useQuery({
    queryKey: ['agents', 'all'],
    queryFn: () => api.get<Page<AgentRow>>('/agents', { limit: 100 }),
    refetchInterval: 60_000,
  });

  const activityByEmployee = new Map(activity.data?.items.map((row) => [row.employeeId, row]));
  const agentByEmployee = new Map<string, AgentRow>();
  for (const agent of agents.data?.items ?? []) {
    const id = agent.workstation.employee.id;
    if (agent.status === 'ACTIVE' && !agentByEmployee.has(id)) agentByEmployee.set(id, agent);
  }
  const rows = users.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="Xodimlar"
        description="Bugungi vaqt ko‘rsatkichlari har daqiqada yangilanadi."
        action={
          can('users.manage') ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Xodim qo‘shish
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
              placeholder="Ism yoki pochta bo‘yicha qidirish"
              aria-label="Qidirish"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            aria-label="Bo‘lim"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">Barcha bo‘limlar</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Rol"
            value={role}
            onChange={(e) => setRole(e.target.value as RoleCode | '')}
          >
            <option value="">Barcha rollar</option>
            {ROLE_CODES.map((code) => (
              <option key={code} value={code}>
                {ROLE_LABELS[code]}
              </option>
            ))}
          </Select>
        </div>

        {users.isPending ? (
          <Loading />
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => void users.refetch()} />
        ) : rows.length === 0 ? (
          <Empty title="Xodim topilmadi" hint="Qidiruv yoki filtrlarni o‘zgartirib ko‘ring." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Ism-familiya</Th>
                  <Th>Bo‘lim</Th>
                  <Th>Lavozim</Th>
                  <Th>Agent holati</Th>
                  <Th>Bugungi faol vaqt</Th>
                  <Th>Nofaol vaqt</Th>
                  <Th>Oxirgi ma’lumot</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => {
                  const employeeId = user.employee?.id;
                  const agent = employeeId ? agentByEmployee.get(employeeId) : undefined;
                  const stats = employeeId ? activityByEmployee.get(employeeId) : undefined;
                  return (
                    <tr key={user.id} className="hover:bg-surface/60">
                      <Td>
                        <Link
                          to={`/xodimlar/${user.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {user.fullName}
                        </Link>
                        <p className="text-xs text-muted">{user.email}</p>
                        {!user.isActive ? <Badge tone="danger">Faol emas</Badge> : null}
                      </Td>
                      <Td>{user.employee?.department?.name ?? '—'}</Td>
                      <Td>{user.employee?.position ?? '—'}</Td>
                      <Td>
                        {!agent ? (
                          <Badge>O‘rnatilmagan</Badge>
                        ) : agent.online ? (
                          <Badge tone="success">Onlayn</Badge>
                        ) : (
                          <Badge tone="warn">Oflayn</Badge>
                        )}
                      </Td>
                      <Td>{canSeeActivity ? formatDuration(stats?.activeSec ?? 0) : '—'}</Td>
                      <Td>{canSeeActivity ? formatDuration(stats?.idleSec ?? 0) : '—'}</Td>
                      <Td className="whitespace-nowrap text-muted">
                        {formatDateTime(agent?.lastSeenAt)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {users.hasNextPage ? (
              <div className="p-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => void users.fetchNextPage()}
                  loading={users.isFetchingNextPage}
                >
                  Yana ko‘rsatish
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <CreateUserDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
