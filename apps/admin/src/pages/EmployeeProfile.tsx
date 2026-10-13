import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ROLE_CODES, type RoleCode } from '@nwi/shared';
import { useAuth } from '@/auth/AuthContext';
import { Empty, ErrorState, Loading, Notice, PageHeader } from '@/components/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { Table, Td, Th } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, errorMessage } from '@/lib/api';
import {
  formatBytes,
  formatDateTime,
  formatDay,
  formatDuration,
  formatTime,
  shiftDay,
  todayLocal,
} from '@/lib/format';
import {
  CATEGORY_LABELS,
  CONFIDENCE_LABELS,
  RELEVANCE_LABELS,
  ROLE_LABELS,
  STATE_LABELS,
} from '@/lib/labels';
import type {
  AgentRow,
  AppSummaryRow,
  Page,
  ScreenshotRow,
  Summary,
  TimelineEvent,
  User,
  WorkDay,
} from '@/lib/types';
import { useDepartments } from './Employees';

interface Range {
  from: string;
  to: string;
}

function RangePicker(props: { value: Range; onChange: (range: Range) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Dan" htmlFor="range-from">
        <Input
          id="range-from"
          type="date"
          value={props.value.from}
          max={props.value.to}
          onChange={(e) =>
            e.target.value && props.onChange({ ...props.value, from: e.target.value })
          }
        />
      </Field>
      <Field label="Gacha" htmlFor="range-to">
        <Input
          id="range-to"
          type="date"
          value={props.value.to}
          min={props.value.from}
          max={todayLocal()}
          onChange={(e) => e.target.value && props.onChange({ ...props.value, to: e.target.value })}
        />
      </Field>
    </div>
  );
}

function Overview({ employeeId, range }: { employeeId: string; range: Range }) {
  const days = useQuery({
    queryKey: ['work-days', employeeId, range],
    queryFn: () => api.get<Summary<WorkDay>>('/activity/work-days', { ...range, employeeId }),
  });
  if (days.isPending) return <Loading />;
  if (days.isError) return <ErrorState error={days.error} onRetry={() => void days.refetch()} />;
  const rows = days.data.items;
  const total = rows.reduce(
    (acc, d) => ({ active: acc.active + d.activeSec, idle: acc.idle + d.idleSec }),
    { active: 0, idle: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Faol vaqt"
          value={formatDuration(total.active)}
          hint="Tanlangan davr uchun"
        />
        <StatCard
          label="Nofaol vaqt"
          value={formatDuration(total.idle)}
          hint="Dastur ochiq, kiritish yo‘q"
        />
        <StatCard label="Ma’lumot kelgan kunlar" value={String(rows.length)} />
      </div>
      <Card>
        <CardHeader
          title="Kunlik ish vaqti"
          description={`Vaqt zonasi: ${days.data.meta.timezone}`}
        />
        {rows.length === 0 ? (
          <Empty
            title="Bu davr uchun ma’lumot yo‘q"
            hint="Agent o‘rnatilmagan yoki shu kunlarda ishlamagan bo‘lishi mumkin."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Sana</Th>
                <Th>Birinchi faoliyat</Th>
                <Th>Oxirgi faoliyat</Th>
                <Th>Faol</Th>
                <Th>Nofaol</Th>
                <Th>Kuzatilgan jami</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.date}>
                  <Td className="font-medium">{formatDay(d.date)}</Td>
                  <Td>{formatTime(d.firstSeenAt)}</Td>
                  <Td>{formatTime(d.lastSeenAt)}</Td>
                  <Td>{formatDuration(d.activeSec)}</Td>
                  <Td>{formatDuration(d.idleSec)}</Td>
                  <Td>{formatDuration(d.observedSec)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function AppsTab({ employeeId, range }: { employeeId: string; range: Range }) {
  const apps = useQuery({
    queryKey: ['activity', 'apps', employeeId, range],
    queryFn: () =>
      api.get<Summary<AppSummaryRow>>('/activity/summary', {
        ...range,
        employeeId,
        groupBy: 'application',
      }),
  });
  if (apps.isPending) return <Loading />;
  if (apps.isError) return <ErrorState error={apps.error} onRetry={() => void apps.refetch()} />;
  if (apps.data.items.length === 0) return <Empty title="Bu davr uchun ma’lumot yo‘q" />;

  return (
    <Card>
      <CardHeader
        title="Dasturlar bo‘yicha statistika"
        description={apps.data.meta.definitions.activeSec}
      />
      <Table>
        <thead>
          <tr>
            <Th>Dastur</Th>
            <Th>Kategoriya</Th>
            <Th>Ish bilan bog‘liqligi</Th>
            <Th>Faol vaqt</Th>
            <Th>Ochiq turgan (nofaol)</Th>
          </tr>
        </thead>
        <tbody>
          {apps.data.items.map((row) => (
            <tr key={row.application?.id ?? 'unknown'}>
              <Td>
                <span className="font-medium">{row.application?.displayName ?? '—'}</span>
                <p className="text-xs text-muted">{row.application?.processName}</p>
              </Td>
              <Td>{CATEGORY_LABELS[row.application?.category ?? 'OTHER']}</Td>
              <Td>{RELEVANCE_LABELS[row.application?.workRelevance ?? 'UNCLASSIFIED']}</Td>
              <Td>{formatDuration(row.activeSec)}</Td>
              <Td>{formatDuration(row.idleSec)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function TimelineTab({ employeeId }: { employeeId: string }) {
  const [date, setDate] = useState(todayLocal());
  const timeline = useQuery({
    queryKey: ['timeline', employeeId, date],
    queryFn: () => api.get<Summary<TimelineEvent>>('/activity/timeline', { employeeId, date }),
  });

  return (
    <Card>
      <CardHeader
        title="Faoliyatlar xronologiyasi"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setDate(shiftDay(date, -1))}>
              ← Oldingi kun
            </Button>
            <Input
              type="date"
              aria-label="Sana"
              className="w-40"
              value={date}
              max={todayLocal()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </div>
        }
      />
      {timeline.isPending ? (
        <Loading />
      ) : timeline.isError ? (
        <ErrorState error={timeline.error} onRetry={() => void timeline.refetch()} />
      ) : timeline.data.items.length === 0 ? (
        <Empty title={`${formatDay(date)} uchun yozuv yo‘q`} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Boshlanish</Th>
              <Th>Tugash</Th>
              <Th>Dastur</Th>
              <Th>Holat</Th>
              <Th>Davomiylik</Th>
              <Th>Manba</Th>
              <Th>Ishonchlilik</Th>
            </tr>
          </thead>
          <tbody>
            {timeline.data.items.map((e) => (
              <tr key={e.id}>
                <Td>{formatTime(e.startedAt)}</Td>
                <Td>{formatTime(e.endedAt)}</Td>
                <Td>
                  {e.application.displayName}
                  {e.domain ? <span className="text-muted"> · {e.domain}</span> : null}
                </Td>
                <Td>
                  <Badge
                    tone={
                      e.state === 'ACTIVE' ? 'success' : e.state === 'IDLE' ? 'warn' : 'neutral'
                    }
                  >
                    {STATE_LABELS[e.state]}
                  </Badge>
                </Td>
                <Td>{formatDuration(e.activeSec + e.idleSec)}</Td>
                <Td>{e.source === 'AGENT' ? 'Agent' : e.source}</Td>
                <Td>{CONFIDENCE_LABELS[e.confidence]}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function ScreenshotViewer({ shot, onClose }: { shot: ScreenshotRow; onClose: () => void }) {
  const image = useQuery({
    queryKey: ['screenshot-image', shot.id],
    queryFn: () => api.blobUrl(`/screenshots/${shot.id}/image`),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  // Yopilganda tasvir brauzer xotirasidan ham olib tashlanadi.
  const url = image.data;
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Ekran tasviri — ${formatDateTime(shot.capturedAt)}`}
      wide
    >
      {image.isPending ? (
        <Loading />
      ) : image.isError ? (
        <ErrorState error={image.error} />
      ) : (
        <img src={image.data} alt="Ekran tasviri" className="w-full rounded border border-line" />
      )}
    </Dialog>
  );
}

function ScreenshotsTab({ employeeId }: { employeeId: string }) {
  const [viewing, setViewing] = useState<ScreenshotRow | null>(null);
  const shots = useInfiniteQuery({
    queryKey: ['screenshots', employeeId],
    queryFn: ({ pageParam }) =>
      api.get<Page<ScreenshotRow>>('/screenshots', { employeeId, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = shots.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Card>
      <CardHeader title="Ekran tasvirlari" />
      <CardBody className="border-b border-line">
        <Notice tone="warn">
          Tasvir faqat “Ko‘rish” bosilganda ochiladi. Har bir ko‘rish — kim, qachon, qaysi tasvirni
          — audit jurnaliga yoziladi.
        </Notice>
      </CardBody>
      {shots.isPending ? (
        <Loading />
      ) : shots.isError ? (
        <ErrorState error={shots.error} onRetry={() => void shots.refetch()} />
      ) : rows.length === 0 ? (
        <Empty
          title="Ekran tasvirlari yo‘q"
          hint="Monitoring siyosatida o‘chirilgan yoki saqlash muddati tugagan bo‘lishi mumkin."
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Olingan vaqt</Th>
                <Th>Hajmi</Th>
                <Th>O‘chiriladigan sana</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((shot) => (
                <tr key={shot.id}>
                  <Td className="font-medium">{formatDateTime(shot.capturedAt)}</Td>
                  <Td>{formatBytes(shot.sizeBytes)}</Td>
                  <Td className="text-muted">{formatDateTime(shot.expiresAt)}</Td>
                  <Td className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setViewing(shot)}>
                      <Eye className="h-3.5 w-3.5" aria-hidden /> Ko‘rish
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {shots.hasNextPage ? (
            <div className="p-4 text-center">
              <Button
                variant="outline"
                onClick={() => void shots.fetchNextPage()}
                loading={shots.isFetchingNextPage}
              >
                Yana ko‘rsatish
              </Button>
            </div>
          ) : null}
        </>
      )}
      {viewing ? <ScreenshotViewer shot={viewing} onClose={() => setViewing(null)} /> : null}
    </Card>
  );
}

function AgentTab({ employeeId }: { employeeId: string }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const agents = useQuery({
    queryKey: ['agents', 'all'],
    queryFn: () => api.get<Page<AgentRow>>('/agents', { limit: 100 }),
  });
  const code = useMutation({
    mutationFn: () =>
      api.post<{ code: string; expiresAt: string }>('/agents/enrollment-codes', { employeeId }),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.post(`/agents/${id}/revoke`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });
  const own = agents.data?.items.filter((a) => a.workstation.employee.id === employeeId) ?? [];

  return (
    <div className="space-y-6">
      {can('agents.manage') ? (
        <Card>
          <CardHeader
            title="Agentni o‘rnatish"
            description="Xodim kompyuteridagi agent shu kod bilan ro‘yxatdan o‘tadi."
          />
          <CardBody className="space-y-3">
            {code.isError ? <Notice tone="error">{errorMessage(code.error)}</Notice> : null}
            {code.data ? (
              <Notice tone="success">
                Kod:{' '}
                <code className="text-base font-semibold tracking-wider">{code.data.code}</code>
                <br />
                {formatDateTime(code.data.expiresAt)} gacha amal qiladi, bir marta ishlatiladi va
                qayta ko‘rsatilmaydi.
              </Notice>
            ) : null}
            <Button onClick={() => code.mutate()} loading={code.isPending}>
              Ro‘yxatdan o‘tish kodini yaratish
            </Button>
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader title="O‘rnatilgan agentlar" />
        {agents.isPending ? (
          <Loading />
        ) : agents.isError ? (
          <ErrorState error={agents.error} onRetry={() => void agents.refetch()} />
        ) : own.length === 0 ? (
          <Empty title="Agent o‘rnatilmagan" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Kompyuter</Th>
                <Th>Holat</Th>
                <Th>Versiya</Th>
                <Th>Oxirgi aloqa</Th>
                <Th>Navbatda</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {own.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <span className="font-medium">{a.workstation.hostname}</span>
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
                  <Td>{formatDateTime(a.lastSeenAt)}</Td>
                  <Td>{a.queueDepth ?? '—'}</Td>
                  <Td className="text-right">
                    {a.status === 'ACTIVE' && can('agents.manage') ? (
                      <Button
                        variant="outline"
                        size="sm"
                        loading={revoke.isPending && revoke.variables === a.id}
                        onClick={() =>
                          window.confirm(
                            'Agent bekor qilinsinmi? U ma’lumot yuborishni to‘xtatadi.',
                          ) && revoke.mutate(a.id)
                        }
                      >
                        Bekor qilish
                      </Button>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function ManageTab({ user }: { user: User }) {
  const { can, me } = useAuth();
  const queryClient = useQueryClient();
  const departments = useDepartments();
  const [fullName, setFullName] = useState(user.fullName);
  const [departmentId, setDepartmentId] = useState(user.employee?.department?.id ?? '');
  const [position, setPosition] = useState(user.employee?.position ?? '');
  const [roles, setRoles] = useState<RoleCode[]>(user.roles);
  const [newPassword, setNewPassword] = useState('');
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const save = useMutation({
    mutationFn: () =>
      api.patch<User>(`/users/${user.id}`, {
        fullName,
        roles,
        employee: { departmentId: departmentId || null, position },
      }),
    onSuccess: invalidate,
  });
  const toggleActive = useMutation({
    mutationFn: () => api.patch<User>(`/users/${user.id}`, { isActive: !user.isActive }),
    onSuccess: invalidate,
  });
  const resetPassword = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/reset-password`, { newPassword }),
    onSuccess: () => setNewPassword(''),
  });
  const resetMfa = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/mfa/reset`),
    onSuccess: invalidate,
  });
  const hasScreenshots = user.extraPermissions.includes('screenshots.view');
  const setScreenshots = useMutation({
    mutationFn: () =>
      api.put(`/users/${user.id}/permissions`, {
        permissions: hasScreenshots
          ? user.extraPermissions.filter((p) => p !== 'screenshots.view')
          : [...user.extraPermissions, 'screenshots.view'],
      }),
    onSuccess: invalidate,
  });
  const toggleRole = (code: RoleCode) =>
    setRoles((r) => (r.includes(code) ? r.filter((x) => x !== code) : [...r, code]));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Ma’lumotlarni tahrirlash" />
        <CardBody className="space-y-4">
          {save.isError ? <Notice tone="error">{errorMessage(save.error)}</Notice> : null}
          {save.isSuccess ? <Notice tone="success">Saqlandi.</Notice> : null}
          <Field label="Ism-familiya" htmlFor="edit-name">
            <Input id="edit-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Bo‘lim" htmlFor="edit-dept">
            <Select
              id="edit-dept"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">— Tanlanmagan —</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lavozim" htmlFor="edit-position">
            <Input
              id="edit-position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </Field>
          <fieldset>
            <legend className="text-sm font-medium">Rollar</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {ROLE_CODES.map((code) => (
                <label key={code} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={roles.includes(code)}
                    onChange={() => toggleRole(code)}
                  />
                  {ROLE_LABELS[code]}
                </label>
              ))}
            </div>
          </fieldset>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={roles.length === 0 || fullName.trim().length < 2}
          >
            Saqlash
          </Button>
        </CardBody>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Kirish va xavfsizlik" />
          <CardBody className="space-y-4">
            {[toggleActive, resetPassword, resetMfa, setScreenshots].map((m, i) =>
              m.isError ? (
                <Notice key={i} tone="error">
                  {errorMessage(m.error)}
                </Notice>
              ) : null,
            )}
            {resetPassword.isSuccess ? (
              <Notice tone="success">
                Parol tiklandi. Xodim birinchi kirishda uni almashtiradi.
              </Notice>
            ) : null}
            <Field
              label="Yangi vaqtinchalik parol"
              htmlFor="reset-password"
              hint="Kamida 12 ta belgi. Xodimning barcha sessiyalari yopiladi."
            >
              <div className="flex gap-2">
                <Input
                  id="reset-password"
                  value={newPassword}
                  autoComplete="off"
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => resetPassword.mutate()}
                  loading={resetPassword.isPending}
                  disabled={newPassword.length < 12}
                >
                  Tiklash
                </Button>
              </div>
            </Field>
            <div className="flex flex-wrap gap-2">
              {user.id !== me?.id ? (
                <Button
                  variant={user.isActive ? 'danger' : 'default'}
                  loading={toggleActive.isPending}
                  onClick={() =>
                    window.confirm(
                      user.isActive
                        ? 'Hisob o‘chirilsinmi? Xodim tizimga kira olmaydi.'
                        : 'Hisob qayta yoqilsinmi?',
                    ) && toggleActive.mutate()
                  }
                >
                  {user.isActive ? 'Hisobni o‘chirish' : 'Hisobni yoqish'}
                </Button>
              ) : null}
              {can('roles.manage') && user.mfaEnabled ? (
                <Button
                  variant="outline"
                  loading={resetMfa.isPending}
                  onClick={() =>
                    window.confirm('MFA tiklansinmi? Xodim uni qaytadan sozlaydi.') &&
                    resetMfa.mutate()
                  }
                >
                  MFA ni tiklash
                </Button>
              ) : null}
            </div>
          </CardBody>
        </Card>

        {can('roles.manage') ? (
          <Card>
            <CardHeader
              title="Ekran tasvirlarini ko‘rish ruxsati"
              description="Hech bir rolda sukut bo‘yicha yo‘q. Berilganda bu foydalanuvchi uchun MFA majburiy bo‘ladi."
            />
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              {hasScreenshots ? (
                <Badge tone="warn">Ruxsat berilgan</Badge>
              ) : (
                <Badge>Ruxsat yo‘q</Badge>
              )}
              <Button
                variant="outline"
                loading={setScreenshots.isPending}
                onClick={() => setScreenshots.mutate()}
              >
                {hasScreenshots ? 'Ruxsatni olib tashlash' : 'Ruxsat berish'}
              </Button>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export function EmployeeProfilePage() {
  const { id = '' } = useParams();
  const { me, can } = useAuth();
  const [range, setRange] = useState<Range>({ from: shiftDay(todayLocal(), -6), to: todayLocal() });
  const user = useQuery({ queryKey: ['users', id], queryFn: () => api.get<User>(`/users/${id}`) });

  if (user.isPending) return <Loading />;
  if (user.isError) return <ErrorState error={user.error} onRetry={() => void user.refetch()} />;
  const data = user.data;
  const employeeId = data.employee?.id;
  const isSelf = data.id === me?.id;
  const showScreenshots = isSelf || can('screenshots.view');

  return (
    <>
      {can('employees.view.all', 'employees.view.department') ? (
        <Link
          to="/xodimlar"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Xodimlar ro‘yxati
        </Link>
      ) : null}
      <PageHeader
        title={data.fullName}
        description={[data.employee?.position, data.employee?.department?.name, data.email]
          .filter(Boolean)
          .join(' · ')}
        action={
          <div className="flex flex-wrap gap-1.5">
            {data.roles.map((r) => (
              <Badge key={r} tone="success">
                {ROLE_LABELS[r]}
              </Badge>
            ))}
            {!data.isActive ? <Badge tone="danger">Faol emas</Badge> : null}
          </div>
        }
      />

      {!employeeId ? (
        <Notice tone="info" className="mb-6">
          Bu hisobda xodim profili yo‘q, shuning uchun faoliyat ma’lumotlari mavjud emas.
        </Notice>
      ) : null}
      {employeeId ? (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Umumiy</TabsTrigger>
            <TabsTrigger value="apps">Dasturlar</TabsTrigger>
            <TabsTrigger value="timeline">Xronologiya</TabsTrigger>
            {showScreenshots ? (
              <TabsTrigger value="screenshots">Ekran tasvirlari</TabsTrigger>
            ) : null}
            <TabsTrigger value="agent">Agent</TabsTrigger>
            {can('users.manage') ? <TabsTrigger value="manage">Boshqaruv</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="overview" className="space-y-6 pt-6">
            <RangePicker value={range} onChange={setRange} />
            <Overview employeeId={employeeId} range={range} />
          </TabsContent>
          <TabsContent value="apps" className="space-y-6 pt-6">
            <RangePicker value={range} onChange={setRange} />
            <AppsTab employeeId={employeeId} range={range} />
          </TabsContent>
          <TabsContent value="timeline" className="pt-6">
            <TimelineTab employeeId={employeeId} />
          </TabsContent>
          {showScreenshots ? (
            <TabsContent value="screenshots" className="pt-6">
              <ScreenshotsTab employeeId={employeeId} />
            </TabsContent>
          ) : null}
          <TabsContent value="agent" className="pt-6">
            <AgentTab employeeId={employeeId} />
          </TabsContent>
          {can('users.manage') ? (
            <TabsContent value="manage" className="pt-6">
              <ManageTab key={data.id} user={data} />
            </TabsContent>
          ) : null}
        </Tabs>
      ) : can('users.manage') ? (
        // Xodim profili bo'lmagan hisob (masalan, administrator) ham boshqarilishi kerak.
        <ManageTab key={data.id} user={data} />
      ) : null}
    </>
  );
}
