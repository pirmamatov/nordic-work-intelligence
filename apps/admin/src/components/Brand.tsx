import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

export function BrandMark(props: { className?: string }) {
  if (brand.logoUrl)
    return (
      <img
        src={brand.logoUrl}
        alt={brand.organization}
        className={cn('h-9 w-auto', props.className)}
      />
    );
  // Rasmiy logotip berilmaguncha neytral belgi ishlatiladi.
  return (
    <span
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-bold text-white',
        props.className,
      )}
      aria-hidden
    >
      N
    </span>
  );
}

export function BrandTitle() {
  return (
    <div className="leading-tight">
      <p className="text-sm font-semibold">{brand.product}</p>
      <p className="text-xs text-muted">{brand.organization}</p>
    </div>
  );
}
