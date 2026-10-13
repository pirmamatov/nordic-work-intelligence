import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { TaskStatus } from '@nwi/shared';
import { ErrorState, Loading, Notice, PageHeader } from '@/components/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import { formatBytes, formatDateTime, formatDay } from '@/lib/format';
import {
  AI_ASSISTED_LABELS,
  DOCUMENT_STATUS_LABELS,
  PRIORITY_LABELS,
  TASK_ACTION_LABELS,
  TASK_STATUS_LABELS,
} from '@/lib/labels';
import type { TaskDetail, TaskDocument } from '@/lib/types';
import { statusTone } from './Tasks';

function useTaskMutation<T>(taskId: string, fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['criteria'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]),
  });
}

function StatusDialog(props: { task: TaskDetail; target: TaskStatus; onClose: () => void }) {
  const { task, target } = props;
  const [comment, setComment] = useState('');
  const [delayReason, setDelayReason] = useState('');
  const change = useTaskMutation(task.id, () =>
    api
      .post(`/tasks/${task.id}/status`, { status: target, comment, delayReason })
      .then(props.onClose),
  );
  const hasApprovedDocument = task.documents.some((d) => d.status === 'APPROVED');
  const commentRequired = target === 'NEEDS_FIX' || (target === 'DONE' && !hasApprovedDocument);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && props.onClose()}
      title={TASK_ACTION_LABELS[target] ?? target}
      description={`Yangi holat: ${TASK_STATUS_LABELS[target]}`}
    >
      <div className="space-y-4">
        {change.isError ? <Notice tone="error">{errorMessage(change.error)}</Notice> : null}
        {target === 'DONE' && !hasApprovedDocument ? (
          <Notice tone="warn">
            Tasdiqlangan hujjat yo‘q. Natija qanday qabul qilinganini izohda yozing.
          </Notice>
        ) : null}
        {target === 'DELAYED' ? (
          <Field label="Kechikish sababi" htmlFor="delay-reason">
            <Textarea
              id="delay-reason"
              value={delayReason}
              onChange={(e) => setDelayReason(e.target.value)}
            />
          </Field>
        ) : null}
        <Field label={commentRequired ? 'Izoh (majburiy)' : 'Izoh'} htmlFor="status-comment">
          <Textarea
            id="status-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={props.onClose}>
            Bekor qilish
          </Button>
          <Button
            variant={target === 'CANCELLED' ? 'danger' : 'default'}
            loading={change.isPending}
            disabled={
              (commentRequired && !comment.trim()) || (target === 'DELAYED' && !delayReason.trim())
            }
            onClick={() => change.mutate(undefined)}
          >
            Tasdiqlash
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ReviewDialog(props: { taskId: string; document: TaskDocument; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [score, setScore] = useState('');
  const review = useTaskMutation(props.taskId, (decision: 'APPROVED' | 'NEEDS_FIX') =>
    api
      .post(`/documents/${props.document.id}/review`, {
        decision,
        note,
        qualityScore: score ? Number(score) : null,
      })
      .then(props.onClose),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && props.onClose()}
      title="Hujjatni tekshirish"
      description={props.document.title}
    >
      <div className="space-y-4">
        {review.isError ? <Notice tone="error">{errorMessage(review.error)}</Notice> : null}
        <Field label="Sifat bahosi (ixtiyoriy)" htmlFor="review-score">
          <Select id="review-score" value={score} onChange={(e) => setScore(e.target.value)}>
            <option value="">— Baholanmagan —</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Izoh" htmlFor="review-note" hint="Tuzatishga qaytarishda majburiy.">
          <Textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            disabled={!note.trim()}
            loading={review.isPending && review.variables === 'NEEDS_FIX'}
            onClick={() => review.mutate('NEEDS_FIX')}
          >
            Tuzatishga qaytarish
          </Button>
          <Button
            loading={review.isPending && review.variables === 'APPROVED'}
            onClick={() => review.mutate('APPROVED')}
          >
            Tasdiqlash
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Documents({ task }: { task: TaskDetail }) {
  const [reviewing, setReviewing] = useState<TaskDocument | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const newFile = useRef<HTMLInputElement>(null);
  const versionFile = useRef<HTMLInputElement>(null);
  const versionTarget = useRef<string | null>(null);

  const upload = useTaskMutation(task.id, async (input: { file: File; documentId?: string }) => {
    const result = input.documentId
      ? await api.upload<{ duplicate: boolean; versionNo: number }>(
          `/documents/${input.documentId}/versions`,
          input.file,
        )
      : await api.upload<{ duplicate: boolean; versionNo: number }>(
          `/tasks/${task.id}/documents`,
          input.file,
        );
    setMessage(
      result.duplicate
        ? `Bu fayl mazmuni ${result.versionNo}-versiya bilan bir xil — yangi versiya yaratilmadi.`
        : input.documentId
          ? `${result.versionNo}-versiya qo‘shildi.`
          : 'Hujjat qo‘shildi.',
    );
  });
  const submit = useTaskMutation(task.id, (id: string) => api.post(`/documents/${id}/submit`));
  const download = useMutation({
    mutationFn: (input: { documentId: string; versionId: string; fileName: string }) =>
      api.download(
        `/documents/${input.documentId}/versions/${input.versionId}/download`,
        input.fileName,
      ),
  });
  const pick = (ref: React.RefObject<HTMLInputElement | null>) => ref.current?.click();
  const tone = (status: TaskDocument['status']) =>
    status === 'APPROVED' ? 'success' : status === 'NEEDS_FIX' ? 'warn' : 'neutral';

  return (
    <Card>
      <CardHeader
        title="Hujjatlar"
        description="Bir xil faylni qayta yuklash yangi hujjat yoki versiya hisoblanmaydi."
        action={
          task.permissions.canUpload ? (
            <Button variant="outline" loading={upload.isPending} onClick={() => pick(newFile)}>
              <Upload className="h-4 w-4" aria-hidden /> Hujjat yuklash
            </Button>
          ) : null
        }
      />
      <input
        ref={newFile}
        type="file"
        className="hidden"
        aria-label="Yangi hujjat fayli"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate({ file });
          e.target.value = '';
        }}
      />
      <input
        ref={versionFile}
        type="file"
        className="hidden"
        aria-label="Yangi versiya fayli"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && versionTarget.current)
            upload.mutate({ file, documentId: versionTarget.current });
          e.target.value = '';
        }}
      />
      <CardBody className="space-y-4">
        {[upload, submit, download].map((m, i) =>
          m.isError ? (
            <Notice key={i} tone="error">
              {errorMessage(m.error)}
            </Notice>
          ) : null,
        )}
        {message && !upload.isError ? <Notice tone="info">{message}</Notice> : null}
        {task.documents.length === 0 ? (
          <p className="text-sm text-muted">Hujjat biriktirilmagan.</p>
        ) : null}
        {task.documents.map((doc) => (
          <div key={doc.id} className="rounded-md border border-line">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3">
              <div>
                <p className="font-medium">{doc.title}</p>
                <p className="text-xs text-muted">
                  {doc.createdBy.fullName} · {AI_ASSISTED_LABELS[doc.aiAssisted]}
                  {doc.qualityScore ? ` · Sifat bahosi: ${doc.qualityScore}/5` : ''}
                </p>
                {doc.reviewNote ? (
                  <p className="mt-1 text-xs">Tekshiruvchi izohi: {doc.reviewNote}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={tone(doc.status)}>{DOCUMENT_STATUS_LABELS[doc.status]}</Badge>
                {task.permissions.canUpload ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      versionTarget.current = doc.id;
                      pick(versionFile);
                    }}
                  >
                    Yangi versiya
                  </Button>
                ) : null}
                {task.permissions.canUpload &&
                (doc.status === 'DRAFT' || doc.status === 'NEEDS_FIX') ? (
                  <Button
                    size="sm"
                    loading={submit.isPending && submit.variables === doc.id}
                    onClick={() => submit.mutate(doc.id)}
                  >
                    Tekshiruvga yuborish
                  </Button>
                ) : null}
                {task.permissions.canApprove &&
                (doc.status === 'SUBMITTED' || doc.status === 'IN_REVIEW') ? (
                  <Button size="sm" onClick={() => setReviewing(doc)}>
                    Tekshirish
                  </Button>
                ) : null}
              </div>
            </div>
            <ul className="divide-y divide-line">
              {doc.versions.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{v.versionNo}-versiya</span> · {v.fileName} ·{' '}
                    {formatBytes(v.sizeBytes)}
                    <span className="text-muted">
                      {' '}
                      · {v.uploadedBy.fullName}, {formatDateTime(v.createdAt)}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${v.fileName}, ${v.versionNo}-versiyani yuklab olish`}
                    onClick={() =>
                      download.mutate({ documentId: doc.id, versionId: v.id, fileName: v.fileName })
                    }
                  >
                    <Download className="h-4 w-4" aria-hidden /> Yuklab olish
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardBody>
      {reviewing ? (
        <ReviewDialog taskId={task.id} document={reviewing} onClose={() => setReviewing(null)} />
      ) : null}
    </Card>
  );
}

function Progress({ task }: { task: TaskDetail }) {
  const [value, setValue] = useState(task.progressPct);
  const save = useTaskMutation(task.id, () =>
    api.patch(`/tasks/${task.id}`, { progressPct: value }),
  );
  const editable =
    (task.permissions.isParticipant || task.permissions.canManage) && task.permissions.canUpload;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Bajarilishi</span>
        <span className="font-medium">{editable ? value : task.progressPct}%</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-surface">
        <div
          className="h-2 rounded-full bg-primary"
          style={{ width: `${editable ? value : task.progressPct}%` }}
        />
      </div>
      {editable ? (
        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={value}
            aria-label="Bajarilish foizi"
            className="flex-1 accent-primary"
            onChange={(e) => setValue(Number(e.target.value))}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={value === task.progressPct}
            loading={save.isPending}
            onClick={() => save.mutate(undefined)}
          >
            Saqlash
          </Button>
        </div>
      ) : null}
      {save.isError ? <p className="mt-1 text-xs text-danger">{errorMessage(save.error)}</p> : null}
      <p className="mt-2 text-xs text-muted">
        Foiz — xodimning o‘z bahosi. Topshiriq faqat natija tasdiqlangach bajarilgan hisoblanadi.
      </p>
    </div>
  );
}

export function TaskDetailPage() {
  const { id = '' } = useParams();
  const [target, setTarget] = useState<TaskStatus | null>(null);
  const [comment, setComment] = useState('');
  const task = useQuery({
    queryKey: ['tasks', id],
    queryFn: () => api.get<TaskDetail>(`/tasks/${id}`),
  });
  const addComment = useTaskMutation(id, () =>
    api.post(`/tasks/${id}/comments`, { body: comment }).then(() => setComment('')),
  );

  if (task.isPending) return <Loading />;
  if (task.isError) return <ErrorState error={task.error} onRetry={() => void task.refetch()} />;
  const data = task.data;
  const info: [string, string][] = [
    ['Mas’ul xodim', data.owner.fullName],
    ['Birgalikda ishlovchilar', data.collaborators.map((c) => c.fullName).join(', ') || '—'],
    [
      'Akkreditatsiya mezoni',
      data.criterion ? `${data.criterion.code} — ${data.criterion.title}` : '—',
    ],
    ['Yo‘nalish', data.direction ?? '—'],
    ['Muddat', formatDay(data.dueAt.slice(0, 10))],
    ['Ustuvorlik', PRIORITY_LABELS[data.priority] ?? data.priority],
    ['Topshiriq bergan', data.createdBy.fullName],
    [
      'Natijani qabul qilgan',
      data.acceptedBy ? `${data.acceptedBy.fullName}, ${formatDateTime(data.acceptedAt)}` : '—',
    ],
  ];

  return (
    <>
      <Link
        to="/topshiriqlar"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Topshiriqlar
      </Link>
      <PageHeader
        title={data.title}
        action={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={statusTone(data.status)}>{TASK_STATUS_LABELS[data.status]}</Badge>
            {data.overdue ? (
              <Badge tone="danger">
                <AlertTriangle className="h-3 w-3" aria-hidden /> Muddati o‘tgan
              </Badge>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardBody className="space-y-4">
              {data.description ? (
                <p className="text-sm whitespace-pre-wrap">{data.description}</p>
              ) : null}
              {data.expectedResult ? (
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                    Kutilayotgan natija
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{data.expectedResult}</p>
                </div>
              ) : null}
              {data.delayReason ? (
                <Notice tone="warn">Kechikish sababi: {data.delayReason}</Notice>
              ) : null}
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {info.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Documents task={data} />

          <Card>
            <CardHeader title="Izohlar" />
            <CardBody className="space-y-4">
              {data.comments.length === 0 ? <p className="text-sm text-muted">Izoh yo‘q.</p> : null}
              {data.comments.map((c) => (
                <div key={c.id} className="text-sm">
                  <p className="text-xs text-muted">
                    {c.author.fullName} · {formatDateTime(c.createdAt)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
              {addComment.isError ? (
                <Notice tone="error">{errorMessage(addComment.error)}</Notice>
              ) : null}
              <div className="flex gap-2">
                <Input
                  aria-label="Yangi izoh"
                  placeholder="Izoh yozing…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={!comment.trim()}
                  loading={addComment.isPending}
                  onClick={() => addComment.mutate(undefined)}
                >
                  Yuborish
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Holat va amallar" />
            <CardBody className="space-y-4">
              <Progress key={data.progressPct} task={data} />
              {data.permissions.allowedTransitions.length === 0 ? (
                <p className="text-sm text-muted">Hozir siz bajara oladigan amal yo‘q.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.permissions.allowedTransitions.map((status) => (
                    <Button
                      key={status}
                      variant={
                        status === 'CANCELLED'
                          ? 'outline'
                          : status === 'APPROVED' || status === 'DONE'
                            ? 'default'
                            : 'outline'
                      }
                      onClick={() => setTarget(status)}
                    >
                      {TASK_ACTION_LABELS[status]}
                    </Button>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Holat tarixi" />
            <CardBody>
              <ol className="space-y-3">
                {data.statusHistory.map((h) => (
                  <li key={h.id} className="border-l-2 border-primary/30 pl-3 text-sm">
                    <p className="font-medium">{TASK_STATUS_LABELS[h.toStatus]}</p>
                    <p className="text-xs text-muted">
                      {h.changedBy.fullName} · {formatDateTime(h.changedAt)}
                    </p>
                    {h.comment ? <p className="mt-0.5 text-xs">{h.comment}</p> : null}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
      {target ? <StatusDialog task={data} target={target} onClose={() => setTarget(null)} /> : null}
    </>
  );
}
