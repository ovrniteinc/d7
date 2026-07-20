const MAX_BYTES = 2 * 1024 * 1024;

export async function readAttachmentFile(file: File): Promise<{ dataUrl: string; sizeBytes: number }> {
  if (file.size > MAX_BYTES) {
    throw new Error("File must be smaller than 2 MB");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({ dataUrl: reader.result as string, sizeBytes: file.size });
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
