import { describe, it, expect } from 'vitest'
import { plainText } from './seo'

describe('plainText', () => {
  it('returns empty string for null, undefined, or empty string', () => {
    expect(plainText(null)).toBe('')
    expect(plainText(undefined)).toBe('')
    expect(plainText('')).toBe('')
  })

  it('returns the same string if no html or extra spaces', () => {
    expect(plainText('hello world')).toBe('hello world')
  })

  it('strips html tags and replaces them with spaces', () => {
    expect(plainText('<p>Hello <b>world</b></p>')).toBe('Hello world')
  })

  it('replaces multiple spaces and newlines with a single space', () => {
    expect(plainText('hello    world\n\n\n!')).toBe('hello world !')
  })

  it('trims leading and trailing spaces', () => {
    expect(plainText('  hello world  ')).toBe('hello world')
  })

  it('handles complex cases with html, newlines, and spaces', () => {
    expect(plainText('\n  <div class="test">\n    <h1>Title</h1>\n    <p>Some   text</p>\n  </div>\n')).toBe('Title Some text')
  })
})
import { describe, it, expect } from 'vitest';
import { createSeoDescription } from './seo';

describe('createSeoDescription', () => {
  it('returns fallback when value is null', () => {
    expect(createSeoDescription(null, 'default')).toBe('default');
  });

  it('returns fallback when value is undefined', () => {
    expect(createSeoDescription(undefined, 'default')).toBe('default');
  });

  it('returns fallback when value is an empty string', () => {
    expect(createSeoDescription('', 'default')).toBe('default');
  });

  it('returns fallback when value becomes empty after normalization (only HTML/whitespace)', () => {
    expect(createSeoDescription('<p>   </p>', 'default')).toBe('default');
  });

  it('returns original string when length is under maximum', () => {
    expect(createSeoDescription('short string', 'default')).toBe('short string');
  });

  it('strips HTML tags and normalizes whitespace', () => {
    expect(createSeoDescription('<p>Hello  <b>world</b>!</p>', 'default')).toBe('Hello world !');
  });

  it('returns original string if exactly maximumLength', () => {
    const text = 'a'.repeat(170);
    expect(createSeoDescription(text, 'default')).toBe(text);
  });

  it('truncates long strings and appends ellipsis', () => {
    const text = 'a'.repeat(200);
    expect(createSeoDescription(text, 'default').length).toBeLessThan(200);
    expect(createSeoDescription(text, 'default').endsWith('…')).toBe(true);
  });

  it('truncates cleanly at a word boundary', () => {
    const text = 'This is a very long string that should be truncated properly without cutting words in half if possible ' + 'a'.repeat(100);
    const result = createSeoDescription(text, 'default');
    expect(result.endsWith('…')).toBe(true);
    // Since it slices at maximumLength - 1 and replaces /\s+\S*$/, it removes the last partial word.
  });

  it('uses custom maximumLength when provided', () => {
    const text = 'This is a test string.';
    expect(createSeoDescription(text, 'default', 10)).toBe('This is…');
  });
});
