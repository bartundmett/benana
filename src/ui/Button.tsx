import { Children, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from './cn';

type ButtonVariant = 'secondary' | 'primary' | 'ghost' | 'link';
type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: boolean;
  active?: boolean;
}

const BASE_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-1 rounded-md border border-border-token bg-btn-secondary px-2.25 py-1.5 text-fg transition-colors duration-150 ease-in-out hover:bg-btn-secondary-hover hover:border-border-heavy-token active:bg-btn-secondary-active focus-visible:outline focus-visible:outline-1 focus-visible:outline-border-focus-token focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  secondary: '',
  primary:
    'border-border-light-token bg-accent-bg text-accent-on font-medium hover:bg-accent-bg-hover active:bg-accent-bg-active',
  ghost:
    'border-transparent bg-transparent hover:border-border-light-token hover:bg-btn-tertiary-hover active:bg-btn-tertiary-active',
  link:
    'w-fit border-0 bg-transparent p-0 text-fg underline decoration-border-heavy-token underline-offset-2 hover:bg-transparent hover:border-transparent active:bg-transparent'
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: '',
  sm: 'px-1.75 py-1 text-sm'
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon = false,
  active = false,
  className,
  type,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(
        BASE_BUTTON_CLASS,
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        icon && 'p-1',
        active && 'active',
        className
      )}
      {...props}
    />
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'icon'> {
  icon: ReactNode;
  label: string;
}

export function IconButton({ icon, label, className, title, children, ...props }: IconButtonProps) {
  const isIconOnly = Children.count(children) === 0;

  return (
    <Button
      icon={isIconOnly}
      aria-label={label}
      title={title ?? label}
      className={cn('icon-child-svg-shrink', className)}
      {...props}
    >
      {icon}
      {children}
    </Button>
  );
}
