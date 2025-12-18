import { describe, it, expect } from 'vitest';

describe('Diagnostic: Can vitest run at all?', () => {
  it('should be able to run basic tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle strings', () => {
    expect('hello').toBe('hello');
  });

  it('should handle booleans', () => {
    expect(true).toBe(true);
  });
});
