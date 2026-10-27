import type { ReactNode } from "react";

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-pale-blue ${className}`} />;
}

export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-[1.5rem] border border-dashed border-line bg-white px-6 py-12 text-center">
      {icon ? <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-pale-blue text-air-blue-ink">{icon}</div> : null}
      <h2 className="text-xl font-semibold">{title}</h2>
      {children ? <div className="mt-2 max-w-md text-muted">{children}</div> : null}
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  id,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  id?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="max-w-2xl">
        {eyebrow ? <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-air-blue-ink">{eyebrow}</p> : null}
        <h2 id={id} className="text-2xl font-bold sm:text-3xl">
          {title}
        </h2>
        {description ? <p className="mt-2 text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
