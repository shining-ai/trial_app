export const MAX_UPLOAD_BYTES = 4294967296;

export function checkFileSize(sizeBytes: number): boolean {
  return sizeBytes <= MAX_UPLOAD_BYTES;
}
