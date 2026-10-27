import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export const controlClasses =
  "block w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-base text-ink placeholder:text-muted/80 " +
  "shadow-[inset_0_1px_1px_rgb(19_41_64/0.04)] transition-colors " +
  "hover:border-[#c3d1dc] focus-visible:border-air-blue focus-visible:outline-3 focus-visible:outline-offset-0 focus-visible:outline-air-blue/40 " +
  "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger/30 disabled:bg-pale-blue disabled:text-muted min-h-11";

export function Label({
  htmlFor,
  children,
  optional,
  className = "",
}: {
  htmlFor: string;
  children: ReactNode;
  optional?: boolean;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={`mb-1.5 block text-sm font-medium text-ink ${className}`}>
      {children}
      {optional ? <span className="ml-1 font-normal text-muted">(opcional)</span> : null}
    </label>
  );
}

export function HelpText({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-sm text-muted">
      {children}
    </p>
  );
}

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-danger" role="alert">
      <span aria-hidden="true">●</span>
      <span>{children}</span>
    </p>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...props },
  ref,
) {
  return <input ref={ref} className={`${controlClasses} ${className}`} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", ...props }, ref) {
    return <textarea ref={ref} className={`${controlClasses} min-h-28 ${className}`} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className = "", children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={`${controlClasses} appearance-none bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat pr-10 ${className}`} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235E707F' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  );
});

/** Agrupa label + controle + ajuda + erro com os ids corretos de acessibilidade. */
export function Field({
  id,
  label,
  optional,
  help,
  error,
  children,
  className = "",
}: {
  id: string;
  label: ReactNode;
  optional?: boolean;
  help?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      {children}
      {help ? <HelpText id={`${id}-help`}>{help}</HelpText> : null}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

/** Props de acessibilidade para ligar o controle à ajuda e ao erro do Field. */
export function describedBy(id: string, { help, error }: { help?: unknown; error?: unknown }) {
  const ids = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean);
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": ids.length ? ids.join(" ") : undefined,
  } as const;
}
