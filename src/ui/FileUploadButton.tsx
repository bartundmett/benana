import { useRef, type ChangeEvent, type ReactNode } from 'react';

import { Button } from './Button';
import { cn } from './cn';

interface FileUploadButtonProps {
  label: ReactNode;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  onFilesSelected: (files: FileList | null) => void;
}

export function FileUploadButton({
  label,
  accept,
  multiple = false,
  disabled = false,
  className,
  onFilesSelected
}: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onFilesSelected(event.target.files);
    event.target.value = '';
  };

  return (
    <>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleChange}
      />
      <Button
        className={cn(className)}
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        {label}
      </Button>
    </>
  );
}
