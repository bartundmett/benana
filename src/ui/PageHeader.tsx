import type { ReactNode } from 'react';

import { cn } from './cn';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleClassName?: string;
  actionsClassName?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
  titleClassName,
  actionsClassName
}: PageHeaderProps) {
  return (
    <header className={cn('flex items-center justify-between gap-2', className)}>
      <div className={cn('grid gap-0.6', titleClassName)}>
        <h2 className="text-lg font-medium">{title}</h2>
        {description ? <p className="text-fg-secondary">{description}</p> : null}
      </div>
      {actions ? (
        <div className={cn('flex items-center gap-1.25', actionsClassName)}>{actions}</div>
      ) : null}
    </header>
  );
}
