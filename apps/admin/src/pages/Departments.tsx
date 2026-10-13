import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { createDepartmentSchema } from '@nwi/shared';
import type { z } from 'zod';
import { useAuth } from '@/auth/AuthContext';
import { Empty, ErrorState, Loading, Notice, PageHeader } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import type { Department } from '@/lib/types';
import { useDepartments } from './Employees';

type FormValues = z.input<typeof createDepartmentSchema>;

function DepartmentDialog(props: {
  department: Department | null;
  all: Department[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = props.department;
  const form = useForm<FormValues>({
    resolver: zodResolver(createDepartmentSchema),
    defaultValues: {
      name: editing?.name ?? '',
      code: editing?.code ?? '',
      parentId: editing?.parentId ?? null,
    },
  });
  const save = useMutation({
    mutationFn: (input: FormValues) =>
      editing
        ? api.patch<Department>(`/departments/${editing.id}`, input)
        : api.post<Department>('/departments', input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
      props.onClose();
    },
  });
  const errors = form.formState.errors;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && props.onClose()}
      title={editing ? 'Bo‘limni tahrirlash' : 'Yangi bo‘lim'}
    >
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        noValidate
      >
        {save.isError ? <Notice tone="error">{errorMessage(save.error)}</Notice> : null}
        <Field label="Nomi" htmlFor="dept-name" error={errors.name?.message}>
          <Input id="dept-name" {...form.register('name')} />
        </Field>
        <Field
          label="Kodi"
          htmlFor="dept-code"
          error={errors.code?.message}
          hint="Masalan: IT, HR, AKKR"
        >
          <Input id="dept-code" {...form.register('code')} />
        </Field>
        <Field label="Yuqori bo‘lim" htmlFor="dept-parent" error={errors.parentId?.message}>
          <Select
            id="dept-parent"
            {...form.register('parentId', { setValueAs: (v: string) => v || null })}
          >
            <option value="">— Yo‘q —</option>
            {props.all
              .filter((d) => d.id !== editing?.id)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={props.onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={save.isPending}>
            Saqlash
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function DepartmentsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const departments = useDepartments();
  const [dialog, setDialog] = useState<{ department: Department | null } | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/departments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'] }),
  });
  const canManage = can('departments.manage');
  const nameById = new Map(departments.data?.map((d) => [d.id, d.name]));

  return (
    <>
      <PageHeader
        title="Bo‘limlar"
        action={
          canManage ? (
            <Button onClick={() => setDialog({ department: null })}>
              <Plus className="h-4 w-4" aria-hidden /> Bo‘lim qo‘shish
            </Button>
          ) : null
        }
      />
      {remove.isError ? (
        <Notice tone="error" className="mb-4">
          {errorMessage(remove.error)}
        </Notice>
      ) : null}
      <Card>
        {departments.isPending ? (
          <Loading />
        ) : departments.isError ? (
          <ErrorState error={departments.error} onRetry={() => void departments.refetch()} />
        ) : departments.data.length === 0 ? (
          <Empty title="Bo‘limlar hali yaratilmagan" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nomi</Th>
                <Th>Kodi</Th>
                <Th>Yuqori bo‘lim</Th>
                <Th>Rahbar</Th>
                <Th>Xodimlar</Th>
                {canManage ? <Th /> : null}
              </tr>
            </thead>
            <tbody>
              {departments.data.map((d) => (
                <tr key={d.id}>
                  <Td className="font-medium">{d.name}</Td>
                  <Td>{d.code}</Td>
                  <Td>{d.parentId ? (nameById.get(d.parentId) ?? '—') : '—'}</Td>
                  <Td>{d.head?.fullName ?? '—'}</Td>
                  <Td>{d.employeeCount}</Td>
                  {canManage ? (
                    <Td className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${d.name} — tahrirlash`}
                        onClick={() => setDialog({ department: d })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${d.name} — o‘chirish`}
                        onClick={() =>
                          window.confirm(`“${d.name}” bo‘limi o‘chirilsinmi?`) &&
                          remove.mutate(d.id)
                        }
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Bo‘lim rahbari xodim profilidagi “Boshqaruv” bo‘limida rol berilgach, shu yerda tayinlanadi.
      </p>
      {dialog ? (
        <DepartmentDialog
          department={dialog.department}
          all={departments.data ?? []}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
