import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from './cn';

type CardTone = 'default' | 'subtle';
type CardAs = 'div' | 'section' | 'article' | 'aside';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: CardAs;
  tone?: CardTone;
  children: ReactNode;
}

const CARD_BASE_CLASS =
  'rounded-md border border-border-token bg-surface-primary shadow-sm';

const CARD_TONE_CLASS: Record<CardTone, string> = {
  default: '',
  subtle: 'border-border-light-token bg-surface-secondary'
};

export function Card({ as = 'article', tone = 'default', className, children, ...props }: CardProps) {
  const Component = as;
  return (
    <Component
      className={cn(CARD_BASE_CLASS, CARD_TONE_CLASS[tone], className)}
      {...(props as HTMLAttributes<HTMLElement>)}
    >
      {children}
    </Component>
  );
}
