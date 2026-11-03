import type { InputHTMLAttributes, ReactNode } from "react";
import { controlClasses, FieldError, HelpText, Label } from "@/components/ui/field";

/** Ids da ajuda e do erro ligados ao controle por aria-describedby. */
function describedBy(id: string, help?: ReactNode, error?: string) {
  const ids = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

export function CheckoutSection({
  number,
  title,
  id,
  children,
}: {
  number: number;
  title: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-lg bg-white p-4 sm:p-6">
      <h2 id={id} className="flex items-center gap-3 text-lg font-bold">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-deep-fjord text-sm font-bold text-white"
        >
          {number}
        </span>
        <span>
          <span className="sr-only">Etapa {number}: </span>
          {title}
        </span>
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange"> & {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  optional?: boolean;
  help?: ReactNode;
  error?: string;
  className?: string;
  inputClassName?: string;
};

export function TextField({
  id,
  label,
  value,
  onValueChange,
  optional,
  help,
  error,
  className = "",
  inputClassName = "",
  ...props
}: TextFieldProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      <input
        id={id}
        name={id}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, help, error)}
        className={`${controlClasses} ${inputClassName}`}
        {...props}
      />
      {help ? <HelpText id={`${id}-help`}>{help}</HelpText> : null}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

export function CheckField({
  id,
  checked,
  onCheckedChange,
  error,
  children,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          id={id}
          name={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 h-5 w-5 shrink-0 accent-deep-fjord focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-air-blue"
        />
        <label htmlFor={id} className="text-[0.9375rem] leading-snug text-ink">
          {children}
        </label>
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}
