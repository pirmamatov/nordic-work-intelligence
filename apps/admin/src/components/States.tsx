import { AlertTriangle, CheckCircle2, Inbox, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

export function Loading(props: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {props.label ?? 'Yuklanmoqda…'}
    </div>
  );
}

export function ErrorState(props: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center" role="alert">
      <AlertTriangle className="h-6 w-6 text-danger" aria-hidden />
      <p className="text-sm text-ink">{errorMessage(props.error)}</p>
      {props.onRetry ? (
        <Button variant="outline" size="sm" onClick={props.onRetry}>
          Qayta urinish
        </Button>
      ) : null}
    </div>
  );
}

export function Empty(props: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center">
      <Inbox className="h-6 w-6 text-muted" aria-hidden />
      <p className="text-sm font-medium">{props.title}</p>
      {props.hint ? <p className="max-w-md text-sm text-muted">{props.hint}</p> : null}
      {props.action}
    </div>
  );
}

export function Notice(props: {
  tone: 'error' | 'success' | 'info' | 'warn';
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    error: 'border-danger/30 bg-danger-soft text-danger',
    success: 'border-primary/30 bg-primary-soft text-primary-dark',
    info: 'border-line bg-surface text-ink',
    warn: 'border-warn/30 bg-warn-soft text-warn',
  };
  const Icon = props.tone === 'success' ? CheckCircle2 : AlertTriangle;
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm',
        styles[props.tone],
        props.className,
      )}
      role={props.tone === 'error' ? 'alert' : 'status'}
    >
      {props.tone === 'info' ? null : <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <div>{props.children}</div>
    </div>
  );
}

export function PageHeader(props: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{props.title}</h1>
        {props.description ? <p className="mt-1 text-sm text-muted">{props.description}</p> : null}
      </div>
      {props.action}
    </div>
  );
}
