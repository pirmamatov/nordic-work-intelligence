import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { createCriterionSchema } from '@nwi/shared';
import type { z } from 'zod';
import { Empty, ErrorState, Loading, Notice, PageHeader } from '@/components/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import type { Criterion } from '@/lib/types';
import { useCriteria } from './Tasks';

type FormValues = z.input<typeof createCriterionSchema>;

function CriterionDialog(props: {
  criterion: Criterion | null;
  all: Criterion[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = props.criterion;
  const form = useForm<FormValues>({
    resolver: zodResolver(createCriterionSchema),
    defaultValues: {
      code: editing?.code ?? '',
      title: editing?.title ?? '',
      description: editing?.description ?? '',
      parentId: editing?.parentId ?? null,
    },
  });
  const save = useMutation({
    mutationFn: (input: FormValues) =>
      editing
        ? api.patch(`/accreditation/criteria/${editing.id}`, input)
        : api.post('/accreditation/criteria', input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['criteria'] });
      props.onClose();
    },
  });
  const errors = form.formState.errors;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && props.onClose()}
      title={editing ? 'Mezonni tahrirlash' : 'Yangi mezon'}
    >
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        noValidate
      >
        {save.isError ? <Notice tone="error">{errorMessage(save.error)}</Notice> : null}
        <Field
          label="Kodi"
          htmlFor="criterion-code"
          error={errors.code?.message}
          hint="Masalan: 3.2.1"
        >
          <Input id="criterion-code" {...form.register('code')} />
        </Field>
        <Field label="Nomi" htmlFor="criterion-title" error={errors.title?.message}>
          <Input id="criterion-title" {...form.register('title')} />
        </Field>
        <Field label="Tavsif" htmlFor="criterion-description" error={errors.description?.message}>
          <Textarea id="criterion-description" {...form.register('description')} />
        </Field>
        <Field label="Yuqori mezon" htmlFor="criterion-parent">
          <Select
            id="criterion-parent"
            {...form.register('parentId', { setValueAs: (v: string) => v || null })}
          >
            <option value="">— Yo‘q —</option>
            {props.all
              .filter((c) => c.id !== editing?.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
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

export function AccreditationPage() {
  const queryClient = useQueryClient();
  const criteria = useCriteria();
  const [dialog, setDialog] = useState<{ criterion: Criterion | null } | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/accreditation/criteria/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['criteria'] }),
  });
  const canManage = criteria.data?.canManage ?? false;

  return (
    <>
      <PageHeader
        title="Akkreditatsiya"
        description="Mezonlar va ular bo‘yicha topshiriqlarning bajarilishi. Raqamlar siz ko‘ra oladigan topshiriqlar bo‘yicha."
        action={
          canManage ? (
            <Button onClick={() => setDialog({ criterion: null })}>
              <Plus className="h-4 w-4" aria-hidden /> Mezon qo‘shish
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
        {criteria.isPending ? (
          <Loading />
        ) : criteria.isError ? (
          <ErrorState error={criteria.error} onRetry={() => void criteria.refetch()} />
        ) : criteria.data.items.length === 0 ? (
          <Empty title="Mezonlar hali kiritilmagan" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Kod</Th>
                <Th>Mezon</Th>
                <Th>Topshiriqlar</Th>
                <Th>Bajarilgan</Th>
                <Th>Tekshiruvda</Th>
                <Th>Muddati o‘tgan</Th>
                <Th>Bajarilish darajasi</Th>
                {canManage ? <Th /> : null}
              </tr>
            </thead>
            <tbody>
              {criteria.data.items.map((c) => (
                <tr key={c.id}>
                  <Td className="font-mono font-medium">{c.code}</Td>
                  <Td className="max-w-md">
                    {c.title}
                    {c.description ? <p className="text-xs text-muted">{c.description}</p> : null}
                  </Td>
                  <Td>{c.tasks.total}</Td>
                  <Td>{c.tasks.done}</Td>
                  <Td>{c.tasks.inReview}</Td>
                  <Td>
                    {c.tasks.overdue > 0 ? <Badge tone="danger">{c.tasks.overdue}</Badge> : 0}
                  </Td>
                  <Td>
                    {c.tasks.completionPct === null ? (
                      <span className="text-muted">Ma’lumot mavjud emas</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 rounded-full bg-surface">
                          <div
                            className="h-1.5 rounded-full bg-primary"
                            style={{ width: `${c.tasks.completionPct}%` }}
                          />
                        </div>
                        {c.tasks.completionPct}%
                      </div>
                    )}
                  </Td>
                  {canManage ? (
                    <Td className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${c.code} — tahrirlash`}
                        onClick={() => setDialog({ criterion: c })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${c.code} — o‘chirish`}
                        onClick={() =>
                          window.confirm(`“${c.code}” mezoni o‘chirilsinmi?`) && remove.mutate(c.id)
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
      {dialog ? (
        <CriterionDialog
          criterion={dialog.criterion}
          all={criteria.data?.items ?? []}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
