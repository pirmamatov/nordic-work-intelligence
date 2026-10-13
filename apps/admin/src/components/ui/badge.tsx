import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tones = {
  neutral: 'bg-surface text-muted border-line',
  success: 'bg-primary-soft text-primary-dark border-primary/20',
  danger: 'bg-danger-soft text-danger border-danger/20',
  warn: 'bg-warn-soft text-warn border-warn/20',
};

export function Badge(props: {
  tone?: keyof typeof tones;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[props.tone ?? 'neutral'],
        props.className,
      )}
    >
      {props.children}
    </span>
  );
}
