import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from './cn';

type StatusTone = 'default' | 'error';
type TextAs = 'p' | 'span' | 'small' | 'div';

interface MutedTextProps extends HTMLAttributes<HTMLElement> {
  as?: TextAs;
  children: ReactNode;
}

export function MutedText({ as = 'p', className, children, ...props }: MutedTextProps) {
  const Component = as;
  return (
    <Component
      className={cn('text-fg-secondary', className)}
      {...(props as HTMLAttributes<HTMLElement>)}
    >
      {children}
    </Component>
  );
}

interface StatusTextProps extends HTMLAttributes<HTMLParagraphElement> {
  tone?: StatusTone;
  children: ReactNode;
}

export function StatusText({ tone = 'default', className, children, ...props }: StatusTextProps) {
  return (
    <p
      className={cn(
        'text-sm text-warning-token',
        tone === 'error' && 'text-error-token',
        className
      )}
      {...props}
    >
      {children}
    </p>
  );
}
