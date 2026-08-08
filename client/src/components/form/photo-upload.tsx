'use client';

import { Trash2, User } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useDeleteFile, useUploadFile } from '@/api/file-mutations';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { cn } from '@/lib/utils';

import { FileDropzone } from './file-dropzone';

interface PhotoUploadProps {
  value: string | null | undefined;
  /** Retained so a replacement can delete the previous object. */
  storageKey?: string | null;
  onChange: (url: string | null, key: string | null) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

const MAX_BYTES = 5 * 1024 * 1024;

export function PhotoUpload({
  value,
  storageKey,
  onChange,
  label = 'Photograph',
  hint = 'JPG, PNG or WEBP, up to 5 MB. Square images look best.',
  disabled,
}: PhotoUploadProps) {
  const upload = useUploadFile();
  const remove = useDeleteFile();
  const [preview, setPreview] = useState<string | null>(null);

  // A local object URL shows the image immediately, before the round trip.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleFile(file: File): void {
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    upload.mutate(
      { file, purpose: 'avatar', replacesKey: storageKey ?? null },
      {
        onSuccess: (stored) => {
          onChange(stored.url, stored.key);
          setPreview(null);
          URL.revokeObjectURL(objectUrl);
        },
        onError: () => {
          // Roll the preview back so the UI never shows a photo that failed.
          setPreview(null);
          URL.revokeObjectURL(objectUrl);
        },
      },
    );
  }

  function handleRemove(): void {
    if (storageKey) remove.mutate(storageKey);
    onChange(null, null);
  }

  const shown = preview ?? value ?? null;

  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <div id={id} aria-describedby={describedBy} className="flex items-start gap-4">
          <div className="relative shrink-0">
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shown}
                alt="Selected photograph"
                className={cn(
                  'size-24 rounded-lg border border-border object-cover',
                  upload.isPending && 'opacity-60',
                )}
              />
            ) : (
              <span
                className="grid size-24 place-items-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground"
                aria-hidden
              >
                <User className="size-7" />
              </span>
            )}

            {upload.isPending ? (
              <div
                className="absolute inset-x-0 bottom-0 h-1.5 overflow-hidden rounded-b-lg bg-muted"
                role="progressbar"
                aria-valuenow={upload.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Upload progress"
              >
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${upload.progress}%` }}
                />
              </div>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <FileDropzone
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              maxBytes={MAX_BYTES}
              onFile={handleFile}
              disabled={disabled || upload.isPending}
              label={value ? 'Drop a new photo to replace' : 'Drop a photo here, or browse'}
              hint={upload.isPending ? `Uploading… ${upload.progress}%` : undefined}
            />

            {value && !upload.isPending ? (
              <Button type="button" variant="ghost" size="sm" onClick={handleRemove}>
                <Trash2 aria-hidden />
                Remove photo
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Field>
  );
}
