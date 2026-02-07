'use client';

import { HTMLAttributes, forwardRef } from 'react';

type CardVariant = 'default' | 'glass' | 'elevated';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: boolean;
  hover?: boolean;
}

const variantStyles: Record<CardVariant, string> = {
  default:
    'bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg,12px)]',
  glass:
    'glass rounded-[var(--radius-lg,12px)]',
  elevated:
    'bg-[var(--surface-elevated)] border border-[var(--border-light)] rounded-[var(--radius-lg,12px)] shadow-lg',
};

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = true, hover = false, children, className = '', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          ${variantStyles[variant]}
          ${padding ? 'p-4' : ''}
          ${hover ? 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:border-[var(--border-focus)]' : ''}
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

function CardHeader({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`pb-3 border-b border-[var(--border)] mb-3 ${className}`} {...props}>
      {children}
    </div>
  );
}

function CardContent({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

function CardFooter({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`pt-3 border-t border-[var(--border)] mt-3 ${className}`} {...props}>
      {children}
    </div>
  );
}

export default Card;
export { CardHeader, CardContent, CardFooter };
