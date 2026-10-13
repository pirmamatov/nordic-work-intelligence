import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { createPolicySchema } from '@nwi/shared';
import { useAuth } from '@/auth/AuthContext';
import { Empty, ErrorState, Loading, Notice, PageHeader } from '@/components/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import { DAY_LABELS } from '@/lib/labels';
import type { Policy } from '@/lib/types';
import { useDepartments } from './Employees';

const lines = (text: string) =>
  text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

function PolicyDialog(props: { policy: Policy | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const p = props.policy;
  const [name, setName] = useState(p?.name ?? '');
  const [days, setDays] = useState<number[]>(p?.workSchedule.days ?? [1, 2, 3, 4, 5]);
  const [start, setStart] = useState(p?.workSchedule.start ?? '09:00');
  const [end, setEnd] = useState(p?.workSchedule.end ?? '18:00');
  const [idleMin, setIdleMin] = useState(String((p?.idleThresholdSec ?? 300) / 60));
  const [screenshots, setScreenshots] = useState(p?.screenshotsEnabled ?? false);
  const [intervalMin, setIntervalMin] = useState(String((p?.screenshotIntervalSec ?? 600) / 60));
  const [excluded, setExcluded] = useState((p?.excludedProcesses ?? []).join('\n'));
  const [domains, setDomains] = useState((p?.allowedDomains ?? []).join('\n'));
  const [isDefault, setIsDefault] = useState(p?.isDefault ?? false);
  const [problems, setProblems] = useState<string[]>([]);

  const save = useMutation({
    mutationFn: (input: unknown) =>
      p ? api.patch<Policy>(`/policies/${p.id}`, input) : api.post<Policy>('/policies', input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['policies'] });
      props.onClose();
    },
  });

  function submit() {
    // Server ham xuddi shu sxema bilan tekshiradi; bu yerda xato darhol ko'rsatiladi.
    const parsed = createPolicySchema.safeParse({
      name,
      workSchedule: { days, start, end },
      timezone: p?.timezone ?? 'Asia/Tashkent',
      idleThresholdSec: Math.round(Number(idleMin) * 60),
      screenshotsEnabled: screenshots,
      screenshotIntervalSec: Math.round(Number(intervalMin) * 60),
      excludedProcesses: lines(excluded),
      allowedDomains: lines(domains),
      isDefault,
    });
    if (!parsed.success) {
      setProblems(parsed.error.issues.map((i) => i.message));
      return;
    }
    setProblems([]);
    save.mutate(parsed.data);
  }

  const toggleDay = (day: number) =>
    setDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day]));

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && props.onClose()}
      title={p ? 'Siyosatni tahrirlash' : 'Yangi siyosat'}
      wide
    >
      <div className="space-y-5">
        {problems.length > 0 ? (
          <Notice tone="error">
            <ul className="list-disc pl-4">
              {problems.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        {save.isError ? <Notice tone="error">{errorMessage(save.error)}</Notice> : null}

        <Field label="Nomi" htmlFor="policy-name">
          <Input id="policy-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <fieldset>
          <legend className="text-sm font-medium">Ish kunlari</legend>
          <p className="text-xs text-muted">
            Agent faqat shu kunlar va soatlarda ma’lumot yig‘adi.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {Object.entries(DAY_LABELS).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={days.includes(Number(value))}
                  onChange={() => toggleDay(Number(value))}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Ish boshlanishi" htmlFor="policy-start">
            <Input
              id="policy-start"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Ish tugashi" htmlFor="policy-end">
            <Input
              id="policy-end"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
          <Field
            label="Nofaollik chegarasi (daqiqa)"
            htmlFor="policy-idle"
            hint="Shuncha vaqt kiritish bo‘lmasa “nofaol”."
          >
            <Input
              id="policy-idle"
              type="number"
              min={0.5}
              max={60}
              step={0.5}
              value={idleMin}
              onChange={(e) => setIdleMin(e.target.value)}
            />
          </Field>
        </div>

        <div className="rounded-md border border-line p-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={screenshots}
              onChange={(e) => setScreenshots(e.target.checked)}
            />
            Ekran tasvirlarini olish
          </label>
          <p className="mt-1 text-xs text-muted">
            Yoqilganda xodim ekranida doimiy belgi turadi va har bir tasvir olinganda xabar chiqadi.
            Tasvirlar shifrlab saqlanadi.
          </p>
          {screenshots ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Interval (daqiqa)" htmlFor="policy-interval">
                <Input
                  id="policy-interval"
                  type="number"
                  min={1}
                  max={60}
                  value={intervalMin}
                  onChange={(e) => setIntervalMin(e.target.value)}
                />
              </Field>
              <Field
                label="Suratga olinmaydigan dasturlar"
                htmlFor="policy-excluded"
                hint="Har qatorda bitta fayl nomi, masalan keepass.exe. Shaxsiy saytlar tushmasligi uchun brauzerni ham qo‘shish mumkin."
              >
                <Textarea
                  id="policy-excluded"
                  value={excluded}
                  onChange={(e) => setExcluded(e.target.value)}
                />
              </Field>
            </div>
          ) : null}
        </div>

        <Field
          label="Tasdiqlangan domenlar"
          htmlFor="policy-domains"
          hint="Har qatorda bitta domen, masalan claude.ai. Boshqa saytlar nomi saqlanmaydi."
        >
          <Textarea
            id="policy-domains"
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Sukut bo‘yicha siyosat (alohida biriktirilmagan barcha xodimlarga qo‘llanadi)
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={props.onClose}>
            Bekor qilish
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Saqlash
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function AssignControl({ policy }: { policy: Policy }) {
  const queryClient = useQueryClient();
  const departments = useDepartments();
  const [departmentId, setDepartmentId] = useState('');
  const assign = useMutation({
    mutationFn: (input: { policyId: string | null; departmentId: string }) =>
      api.put('/policies/assignments', input),
    onSuccess: async () => {
      setDepartmentId('');
      await queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
  });
  const assigned = policy.assignments.flatMap((a) => (a.department ? [a.department] : []));
  const employees = policy.assignments.flatMap((a) => (a.employee ? [a.employee] : []));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {assigned.map((d) => (
          <Badge key={d.id} tone="success">
            {d.name}
            <button
              className="ml-1"
              aria-label={`${d.name} — biriktirishni olib tashlash`}
              onClick={() => assign.mutate({ policyId: null, departmentId: d.id })}
            >
              ×
            </button>
          </Badge>
        ))}
        {employees.map((e) => (
          <Badge key={e.id}>{e.user.fullName}</Badge>
        ))}
        {assigned.length + employees.length === 0 ? (
          <span className="text-xs text-muted">Hech kimga alohida biriktirilmagan</span>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Select
          aria-label="Bo‘limga biriktirish"
          className="h-8 max-w-56"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
        >
          <option value="">Bo‘limga biriktirish…</option>
          {departments.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={!departmentId}
          loading={assign.isPending}
          onClick={() => assign.mutate({ policyId: policy.id, departmentId })}
        >
          Biriktirish
        </Button>
      </div>
      {assign.isError ? <p className="text-xs text-danger">{errorMessage(assign.error)}</p> : null}
    </div>
  );
}

export function PoliciesPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ policy: Policy | null } | null>(null);
  const policies = useQuery({
    queryKey: ['policies'],
    queryFn: () => api.get<{ items: Policy[] }>('/policies').then((r) => r.items),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/policies/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['policies'] }),
  });
  const canManage = can('policy.manage');

  return (
    <>
      <PageHeader
        title="Monitoring siyosati"
        description="Nima, qachon va qanday yig‘ilishini belgilaydi. Tartib: xodimga biriktirilgan → bo‘limga biriktirilgan → sukut bo‘yicha."
        action={
          canManage ? (
            <Button onClick={() => setDialog({ policy: null })}>
              <Plus className="h-4 w-4" aria-hidden /> Siyosat qo‘shish
            </Button>
          ) : null
        }
      />
      {remove.isError ? (
        <Notice tone="error" className="mb-4">
          {errorMessage(remove.error)}
        </Notice>
      ) : null}
      {policies.isPending ? (
        <Loading />
      ) : policies.isError ? (
        <ErrorState error={policies.error} onRetry={() => void policies.refetch()} />
      ) : policies.data.length === 0 ? (
        <Card>
          <Empty
            title="Siyosat yaratilmagan"
            hint="Hozir ichki standart qo‘llanmoqda: dushanba–juma, 09:00–18:00, ekran tasvirlari o‘chirilgan."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {policies.data.map((policy) => (
            <Card key={policy.id}>
              <CardHeader
                title={policy.name}
                description={`Versiya ${policy.version}`}
                action={
                  canManage ? (
                    <div className="flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${policy.name} — tahrirlash`}
                        onClick={() => setDialog({ policy })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${policy.name} — o‘chirish`}
                        onClick={() =>
                          window.confirm(`“${policy.name}” siyosati o‘chirilsinmi?`) &&
                          remove.mutate(policy.id)
                        }
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  ) : null
                }
              />
              <CardBody className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  {policy.isDefault ? <Badge tone="success">Sukut bo‘yicha</Badge> : null}
                  {policy.screenshotsEnabled ? (
                    <Badge tone="warn">
                      Ekran tasviri: har {policy.screenshotIntervalSec / 60} daqiqada
                    </Badge>
                  ) : (
                    <Badge>Ekran tasviri o‘chirilgan</Badge>
                  )}
                </div>
                <p>
                  <span className="text-muted">Ish vaqti:</span>{' '}
                  {policy.workSchedule.days.map((d) => DAY_LABELS[d]?.slice(0, 2)).join(', ')} ·{' '}
                  {policy.workSchedule.start}–{policy.workSchedule.end} ({policy.timezone})
                </p>
                <p>
                  <span className="text-muted">Nofaollik chegarasi:</span>{' '}
                  {policy.idleThresholdSec / 60} daqiqa
                </p>
                {policy.excludedProcesses.length > 0 ? (
                  <p>
                    <span className="text-muted">Suratga olinmaydi:</span>{' '}
                    {policy.excludedProcesses.join(', ')}
                  </p>
                ) : null}
                {policy.allowedDomains.length > 0 ? (
                  <p>
                    <span className="text-muted">Tasdiqlangan domenlar:</span>{' '}
                    {policy.allowedDomains.join(', ')}
                  </p>
                ) : null}
                {canManage ? <AssignControl policy={policy} /> : null}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      {dialog ? <PolicyDialog policy={dialog.policy} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
