'use client';

import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import type { ReactNode } from 'react';

import { Field } from '@/components/ui/field';
import { Input, type InputProps } from '@/components/ui/input';
import { Select, type SelectOption } from '@/components/ui/select';

interface BaseProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
}

/** Reads the (possibly nested) error for a path like `address.city`. */
function errorFor<T extends FieldValues>(form: UseFormReturn<T>, name: Path<T>): string | undefined {
  const message = name
    .split('.')
    .reduce<unknown>(
      (node, segment) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[segment] : undefined,
      form.formState.errors,
    );

  if (message && typeof message === 'object' && 'message' in message) {
    const value = (message as { message?: unknown }).message;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

/**
 * Binds react-hook-form to the accessible `Field` wrapper so every input in the
 * product gets a label, hint, error and the aria wiring without repeating it.
 */
export function TextField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  required,
  className,
  ...inputProps
}: BaseProps<T> & Omit<InputProps, 'name' | 'form'>) {
  const error = errorFor(form, name);

  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          invalid={invalid}
          {...inputProps}
          {...form.register(name)}
        />
      )}
    </Field>
  );
}

export function NumberField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  required,
  className,
  nullable,
  ...inputProps
}: BaseProps<T> &
  Omit<InputProps, 'name' | 'form' | 'type'> & {
    /**
     * For a `z.number().nullable()` field: an empty box becomes `null` rather
     * than `NaN`, so "not set" validates instead of reading as a bad number.
     */
    nullable?: boolean;
  }) {
  const error = errorFor(form, name);

  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          aria-describedby={describedBy}
          invalid={invalid}
          {...inputProps}
          // Without valueAsNumber the form submits "8.6" and a z.number()
          // schema rejects it as a string.
          {...(nullable
            ? form.register(name, {
                setValueAs: (value: unknown) => {
                  if (value === '' || value === null || value === undefined) return null;
                  const parsed = Number(value);
                  return Number.isNaN(parsed) ? null : parsed;
                },
              })
            : form.register(name, { valueAsNumber: true }))}
        />
      )}
    </Field>
  );
}

export function DateField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  required,
  className,
  nullable,
  ...inputProps
}: BaseProps<T> &
  Omit<InputProps, 'name' | 'form' | 'type'> & {
    /**
     * For an optional `z.coerce.date()` field: an empty box becomes `null`
     * rather than `''`, which coerces to an Invalid Date and fails the field.
     */
    nullable?: boolean;
  }) {
  const error = errorFor(form, name);

  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          type="date"
          aria-describedby={describedBy}
          invalid={invalid}
          {...inputProps}
          {...(nullable
            ? form.register(name, { setValueAs: (value: unknown) => value || null })
            : form.register(name))}
        />
      )}
    </Field>
  );
}

interface SelectFieldProps<T extends FieldValues> extends BaseProps<T> {
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

export function SelectField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  required,
  className,
  options,
  placeholder,
  disabled,
}: SelectFieldProps<T>) {
  const error = errorFor(form, name);

  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <Select
          id={id}
          options={options}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={describedBy}
          invalid={invalid}
          {...form.register(name)}
        />
      )}
    </Field>
  );
}

interface TextAreaFieldProps<T extends FieldValues> extends BaseProps<T> {
  rows?: number;
  placeholder?: string;
  maxLength?: number;
}

export function TextAreaField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  required,
  className,
  rows = 3,
  placeholder,
  maxLength,
}: TextAreaFieldProps<T>) {
  const error = errorFor(form, name);

  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          rows={rows}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="flex w-full rounded-md border border-input bg-surface px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger"
          {...form.register(name)}
        />
      )}
    </Field>
  );
}

interface CommaListFieldProps<T extends FieldValues> extends BaseProps<T> {
  placeholder?: string;
  /** For a `z.array(z.number())` field, such as a list of graduating years. */
  numeric?: boolean;
}

/**
 * A free-text list — skills, locations, accepted degrees — typed with commas.
 *
 * The value on the wire is an array, so the field splits on save rather than
 * asking the user to manage rows. Uncontrolled on purpose: re-rendering from
 * the split value would eat the comma the moment it was typed.
 */
export function CommaListField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  required,
  className,
  placeholder,
  numeric,
}: CommaListFieldProps<T>) {
  const error = errorFor(form, name);
  const current = (form.watch(name) as Array<string | number> | undefined) ?? [];

  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          type="text"
          placeholder={placeholder}
          aria-describedby={describedBy}
          invalid={invalid}
          defaultValue={current.join(', ')}
          onChange={(event) => {
            const entries = event.target.value
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean);

            // A half-typed year must not become NaN and fail the whole field.
            const value = numeric
              ? entries.map(Number).filter((entry) => !Number.isNaN(entry))
              : entries;

            form.setValue(name, value as never, { shouldDirty: true });
          }}
        />
      )}
    </Field>
  );
}

/** Groups related fields under a heading, so long forms stay scannable. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 border-b border-border pb-6 last:border-0 last:pb-0">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}
