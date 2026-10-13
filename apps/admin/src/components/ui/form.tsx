import * as LabelPrimitive from '@radix-ui/react-label';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-muted/70 disabled:bg-surface disabled:text-muted aria-[invalid=true]:border-danger';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, 'h-10', className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, 'h-10', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-20 py-2', className)} {...props} />;
}

export function Label({ className, ...props }: LabelPrimitive.LabelProps) {
  return (
    <LabelPrimitive.Root className={cn('text-sm font-medium text-ink', className)} {...props} />
  );
}

/** Yorliq, boshqaruv elementi, izoh va xato matnini birlashtiradi. */
export function Field(props: {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.htmlFor}>{props.label}</Label>
      {props.children}
      {props.hint && !props.error ? <p className="text-xs text-muted">{props.hint}</p> : null}
      {props.error ? (
        <p className="text-xs text-danger" role="alert">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}
