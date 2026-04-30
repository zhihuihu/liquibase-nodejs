import { describe, it, expect } from 'vitest';
import { calculateChecksum } from '../../src/utils/checksum';

describe('calculateChecksum', () => {
  it('should return consistent MD5 for same input', () => {
    const sql = 'CREATE TABLE users (id INT PRIMARY KEY);';
    const hash1 = calculateChecksum(sql);
    const hash2 = calculateChecksum(sql);
    expect(hash1).toBe(hash2);
  });

  it('should return different MD5 for different input', () => {
    const hash1 = calculateChecksum('CREATE TABLE a (id INT);');
    const hash2 = calculateChecksum('CREATE TABLE b (id INT);');
    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty string', () => {
    const hash = calculateChecksum('');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(32);
  });

  it('should handle multiline SQL', () => {
    const sql = `CREATE TABLE users (
      id INT PRIMARY KEY,
      name VARCHAR(255) NOT NULL
    );`;
    const hash = calculateChecksum(sql);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(32);
  });
});
