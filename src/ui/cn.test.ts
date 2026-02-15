import { describe, expect, it } from 'vitest';

import { cn } from './cn';

describe('cn', () => {
  it('joins truthy class parts', () => {
    expect(cn('btn', 'btn-primary', 'px-3')).toBe('btn btn-primary px-3');
  });

  it('skips falsey values', () => {
    expect(cn('btn', false, null, undefined, '', 'rounded')).toBe('btn rounded');
  });

  it('resolves tailwind utility conflicts by last class', () => {
    expect(cn('inline-flex justify-center', 'justify-between')).toBe('inline-flex justify-between');
  });
});
