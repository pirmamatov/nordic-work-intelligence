import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-line bg-white', className)} {...props} />;
}

export function CardHeader(props: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-base font-semibold">{props.title}</h2>
        {props.description ? (
          <p className="mt-0.5 text-sm text-muted">{props.description}</p>
        ) : null}
      </div>
      {props.action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function StatCard(props: { label: string; value: string; hint?: string; icon?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{props.label}</p>
        {props.icon ? <span className="text-primary">{props.icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{props.value}</p>
      {props.hint ? <p className="mt-1 text-xs text-muted">{props.hint}</p> : null}
    </Card>
  );
}
