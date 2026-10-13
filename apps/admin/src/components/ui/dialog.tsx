import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Dialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <DialogPrimitive.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-6 shadow-xl',
            props.wide ? 'max-w-3xl' : 'max-w-lg',
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold">
                {props.title}
              </DialogPrimitive.Title>
              {/* Tavsif bo'lmasa ham element qoladi: ekran o'quvchilar uchun dialog tavsifi talab qilinadi. */}
              <DialogPrimitive.Description
                className={cn('mt-1 text-sm text-muted', !props.description && 'sr-only')}
              >
                {props.description ?? props.title}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              className="rounded-md p-1 text-muted hover:bg-surface"
              aria-label="Yopish"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          {props.children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
