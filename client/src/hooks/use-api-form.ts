'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, type DefaultValues, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import type { ZodType } from 'zod';

import { ApiError } from '@/lib/api-client';

interface UseApiFormOptions<T extends FieldValues> {
  schema: ZodType<T>;
  defaultValues: DefaultValues<T>;
  onSubmit: (values: T) => Promise<unknown>;
  onSuccess?: (result: unknown) => void;
}

interface UseApiFormResult<T extends FieldValues> {
  form: UseFormReturn<T>;
  formError: string | null;
  requestId: string | undefined;
  handleSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>;
  isSubmitting: boolean;
}

/**
 * One place where server errors become form errors.
 *
 * The API returns `details: [{ field, message }]` using the same field paths as
 * the shared Zod schema, so a duplicate roll number lands on the roll number
 * input rather than in a banner the user has to map back to a field themselves.
 * Anything without a field path becomes the form-level message.
 */
export function useApiForm<T extends FieldValues>({
  schema,
  defaultValues,
  onSubmit,
  onSuccess,
}: UseApiFormOptions<T>): UseApiFormResult<T> {
  const [formError, setFormError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | undefined>();

  const form = useForm<T>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onBlur',
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    setRequestId(undefined);

    try {
      const result = await onSubmit(values);
      onSuccess?.(result);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError('Something went wrong. Please try again.');
        return;
      }

      setRequestId(error.requestId);

      const mappable = error.details.filter((detail) => detail.field && detail.field !== '_root');

      if (mappable.length > 0) {
        for (const detail of mappable) {
          form.setError(detail.field as Path<T>, { type: 'server', message: detail.message });
        }

        // Move focus to the first thing that needs fixing rather than leaving
        // the user to hunt for it in a long form.
        form.setFocus(mappable[0]!.field as Path<T>);
        return;
      }

      setFormError(error.message);
    }
  });

  return {
    form,
    formError,
    requestId,
    handleSubmit,
    isSubmitting: form.formState.isSubmitting,
  };
}
