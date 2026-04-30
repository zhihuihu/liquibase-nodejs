import md5 from 'md5';

export function calculateChecksum(content: string): string {
  return md5(content);
}
