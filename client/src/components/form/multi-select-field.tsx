'use client';

import { Check, X } from 'lucide-react';
import { useState } from 'react';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

import { Field } from '@/components/ui/field';
import { cn } from '@/lib/utils';

export interface MultiOption {
  value: string;
  label: string;
}

interface MultiSelectFieldProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  options: MultiOption[];
  hint?: string;
  required?: boolean;
  className?: string;
  emptyLabel?: string;
}

/**
 * A checkbox list rather than a custom combobox. Selected values render as
 * removable chips so the current state is visible without opening anything —
 * important when a course carries eight batches.
 */
export function MultiSelectField<T extends FieldValues>({
  form,
  name,
  label,
  options,
  hint,
  required,
  className,
  emptyLabel = 'None selected',
}: MultiSelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = (form.watch(name) as string[] | undefined) ?? [];

  function toggle(value: string): void {
    const next = selected.includes(value)
      ? selected.filter((entry) => entry !== value)
      : [...selected, value];

    form.setValue(name, next as never, { shouldDirty: true, shouldValidate: true });
  }

  const selectedLabels = options.filter((option) => selected.includes(option.value));

  return (
    <Field label={label} hint={hint} required={required} className={className}>
      {({ id, describedBy }) => (
        <div id={id} aria-describedby={describedBy}>
          <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-surface p-2">
            {selectedLabels.length > 0 ? (
              selectedLabels.map((option) => (
                <span
                  key={option.value}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {option.label}
                  <button
                    type="button"
                    onClick={() => toggle(option.value)}
                    className="rounded-full hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove ${option.label}`}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))
            ) : (
              <span className="px-1 text-xs text-muted-foreground">{emptyLabel}</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className="mt-1.5 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {open ? 'Done' : `Choose ${label.toLowerCase()}`}
          </button>

          {open ? (
            <div
              role="group"
              aria-label={label}
              className="scrollbar-thin mt-2 max-h-48 overflow-y-auto rounded-md border border-border bg-popover p-1"
            >
              {options.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  Nothing available to select.
                </p>
              ) : (
                options.map((option) => {
                  const isSelected = selected.includes(option.value);

                  return (
                    <label
                      key={option.value}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted',
                        isSelected && 'text-primary',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isSelected}
                        onChange={() => toggle(option.value)}
                      />
                      <span
                        className={cn(
                          'grid size-4 shrink-0 place-items-center rounded border',
                          isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                        )}
                        aria-hidden
                      >
                        {isSelected ? <Check className="size-3" /> : null}
                      </span>
                      {option.label}
                    </label>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      )}
    </Field>
  );
}
