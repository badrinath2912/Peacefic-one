'use client';

import { Upload } from 'lucide-react';
import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface FileDropzoneProps {
  accept: string;
  /** Bytes. Checked here for a fast message; the server checks again. */
  maxBytes: number;
  onFile: (file: File) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
  children?: ReactNode;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Drag-and-drop with a real, focusable file input behind it. The whole zone is
 * a button so it works from the keyboard — a div with a drop handler is
 * unusable without a mouse.
 */
export function FileDropzone({
  accept,
  maxBytes,
  onFile,
  disabled,
  label = 'Drop a file here, or browse',
  hint,
  children,
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accepted = accept.split(',').map((value) => value.trim().toLowerCase());

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      setError(null);

      const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
      const typeAllowed = accepted.some(
        (value) => value === extension || value === file.type || value === '*',
      );

      if (!typeAllowed) {
        setError(`That file type is not accepted. Allowed: ${accepted.join(', ')}.`);
        return;
      }

      if (file.size > maxBytes) {
        setError(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`);
        return;
      }

      onFile(file);
    },
    [accepted, maxBytes, onFile],
  );

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    handleFile(event.dataTransfer.files[0]);
  }

  return (
    <div className={className}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-lg border-2 border-dashed transition-colors',
          isDragging ? 'border-primary bg-primary-subtle' : 'border-border',
          error && 'border-danger',
          disabled && 'opacity-50',
        )}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 px-6 py-8 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed"
        >
          {children ?? (
            <>
              <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <Upload className="size-4" aria-hidden />
              </span>
              <span className="text-sm font-medium">{label}</span>
              {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
            </>
          )}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            // Reset so choosing the same file twice still fires a change.
            event.target.value = '';
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
