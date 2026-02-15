import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { normalizeRelativePath, normalizeStudioPath, toStudioUrl } from './paths.js';

describe('normalizeRelativePath', () => {
  it('normalizes separators and strips leading slash', () => {
    const joined = path.join('images', 'foo.png');
    expect(normalizeRelativePath(`/${joined}`)).toBe('images/foo.png');
  });
});

describe('toStudioUrl', () => {
  it('builds a studio:// URL from a relative path', () => {
    expect(toStudioUrl('images/foo.png')).toBe('studio://local/images/foo.png');
  });

  it('builds a studio:// URL from an absolute path', () => {
    const absolute = path.join('/tmp', 'foo.png');
    const expectedToken = Buffer.from(normalizeStudioPath(absolute), 'utf8').toString('base64url');
    expect(toStudioUrl(absolute)).toBe(`studio://local/abs/${expectedToken}`);
  });
});

describe('normalizeStudioPath', () => {
  it('keeps absolute paths absolute', () => {
    const absolute = path.join('/tmp', 'foo.png');
    expect(normalizeStudioPath(absolute)).toBe(absolute);
  });
});
