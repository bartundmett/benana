import type { ReactNode } from 'react';

import { cn } from './cn';

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'grid gap-1.5 rounded-md border border-dashed border-border-token bg-surface-secondary p-3',
        className
      )}
    >
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
