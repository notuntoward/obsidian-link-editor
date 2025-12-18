import { describe, it, expect } from 'vitest';

import {
  isValidWikiLink,
  isValidMarkdownLink,
  parseWikiLink,
  parseMarkdownLink,
  wikiToMarkdown,
  markdownToWiki,
  isUrl,
  normalizeUrl,
  isAlmostUrl,
  urlAtCursor,
  detectMarkdownLinkAtCursor,
  detectWikiLinkAtCursor,
  detectLinkAtCursor,
  parseClipboardLink,
  validateLinkDestination,
} from '../src/utils';

describe('URL Detection', () => {
  it('isUrl should detect https URLs', () => {
    expect(isUrl('https://example.com')).toBe(true);
  });

  it('isUrl should detect http URLs', () => {
    expect(isUrl('http://example.com')).toBe(true);
  });

  it('isUrl should detect www URLs', () => {
    expect(isUrl('www.example.com')).toBe(true);
  });

  it('isUrl should reject non-URLs', () => {
    expect(isUrl('example.com')).toBe(false);
    expect(isUrl('just text')).toBe(false);
  });

  it('isUrl should handle empty strings', () => {
    expect(isUrl('')).toBe(false);
  });
});

describe('URL Normalization', () => {
  it('normalizeUrl should add https to www URLs', () => {
    expect(normalizeUrl('www.example.com')).toBe('https://www.example.com');
  });

  it('normalizeUrl should preserve http URLs', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('normalizeUrl should preserve https URLs', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
  });
});

describe('Almost URL Detection', () => {
  it('isAlmostUrl should detect typo-ish prefixes', () => {
    expect(isAlmostUrl('htp://example.com')).toBe(true);
    expect(isAlmostUrl('htps://example.com')).toBe(true);
    expect(isAlmostUrl('www.example.com')).toBe(true);
  });

  it('isAlmostUrl should treat normal text as not almost-url', () => {
    expect(isAlmostUrl('example.com')).toBe(false);
    expect(isAlmostUrl('just text')).toBe(false);
    expect(isAlmostUrl('')).toBe(false);
  });
});

describe('WikiLink Validation', () => {
  it('isValidWikiLink should reject URLs', () => {
    expect(isValidWikiLink('https://example.com')).toBe(false);
  });

  it('isValidWikiLink should accept valid filenames', () => {
    expect(isValidWikiLink('MyNote')).toBe(true);
    expect(isValidWikiLink('My Note')).toBe(true);
  });

  it('isValidWikiLink should reject forbidden characters', () => {
    expect(isValidWikiLink('file|name')).toBe(false);
    expect(isValidWikiLink('file:name')).toBe(false);
    expect(isValidWikiLink('file*name')).toBe(false);
  });

  it('isValidWikiLink should reject empty strings', () => {
    expect(isValidWikiLink('')).toBe(false);
  });
});

describe('Markdown Link Validation', () => {
  it('isValidMarkdownLink should accept URLs', () => {
    expect(isValidMarkdownLink('https://example.com')).toBe(true);
    expect(isValidMarkdownLink('www.example.com')).toBe(true);
  });

  it('isValidMarkdownLink should reject unencoded spaces', () => {
    expect(isValidMarkdownLink('my file.md')).toBe(false);
  });

  it('isValidMarkdownLink should accept encoded spaces', () => {
    expect(isValidMarkdownLink('my%20file.md')).toBe(true);
  });

  it('isValidMarkdownLink should reject empty strings', () => {
    expect(isValidMarkdownLink('')).toBe(false);
  });
});

describe('Link Parsing', () => {
  it('parseWikiLink should parse basic wikilinks', () => {
    const result = parseWikiLink('[[MyNote]]');
    expect(result).toBeDefined();
    expect(result?.destination).toBe('MyNote');
    expect(result?.text).toBe('MyNote');
    expect(result?.isEmbed).toBe(false);
  });

  it('parseWikiLink should parse wikilinks with display text', () => {
    const result = parseWikiLink('[[MyNote|Display]]');
    expect(result).toBeDefined();
    expect(result?.destination).toBe('MyNote');
    expect(result?.text).toBe('Display');
  });

  it('parseWikiLink should parse embedded wikilinks', () => {
    const result = parseWikiLink('![[Image.png]]');
    expect(result).toBeDefined();
    expect(result?.isEmbed).toBe(true);
  });

  it('parseWikiLink should return null for invalid input', () => {
    expect(parseWikiLink('not a link')).toBeNull();
    expect(parseWikiLink('')).toBeNull();
  });

  it('parseMarkdownLink should parse markdown links', () => {
    const result = parseMarkdownLink('[text](dest.md)');
    expect(result).toBeDefined();
    expect(result?.destination).toBe('dest.md');
    expect(result?.text).toBe('text');
    expect(result?.isEmbed).toBe(false);
  });

  it('parseMarkdownLink should parse embedded markdown links', () => {
    const result = parseMarkdownLink('![alt](image.png)');
    expect(result).toBeDefined();
    expect(result?.isEmbed).toBe(true);
  });

  it('parseMarkdownLink should return null for invalid input', () => {
    expect(parseMarkdownLink('not a link')).toBeNull();
    expect(parseMarkdownLink('')).toBeNull();
  });
});

describe('Link Conversion', () => {
  it('wikiToMarkdown should encode spaces', () => {
    expect(wikiToMarkdown('My Note')).toBe('My%20Note');
  });

  it('wikiToMarkdown should encode carets', () => {
    expect(wikiToMarkdown('Note^ref')).toBe('Note%5Eref');
  });

  it('wikiToMarkdown should preserve URLs', () => {
    expect(wikiToMarkdown('https://example.com')).toBe('https://example.com');
  });

  it('markdownToWiki should decode spaces', () => {
    expect(markdownToWiki('My%20Note')).toBe('My Note');
  });

  it('markdownToWiki should decode carets', () => {
    expect(markdownToWiki('Note%5Eref')).toBe('Note^ref');
  });

  it('markdownToWiki should return null for URLs', () => {
    expect(markdownToWiki('https://example.com')).toBeNull();
  });

  it('should handle empty strings', () => {
    expect(wikiToMarkdown('')).toBe('');
    expect(markdownToWiki('')).toBe('');
  });
});

describe('URL at Cursor', () => {
  it('urlAtCursor should find URLs at cursor position', () => {
    const text = 'Visit https://example.com today';
    expect(urlAtCursor(text, 10)).toBe('https://example.com');
  });

  it('urlAtCursor should return null if no URL at cursor', () => {
    const text = 'This is plain text';
    expect(urlAtCursor(text, 5)).toBeNull();
  });

  it('urlAtCursor should find www URLs', () => {
    const text = 'Check www.example.com now';
    expect(urlAtCursor(text, 10)).toBe('www.example.com');
  });
});

describe('Clipboard Link Parsing', () => {
  it('parseClipboardLink should parse WikiLinks', () => {
    const result = parseClipboardLink('[[MyNote|Display]]');
    expect(result).toBeDefined();
    expect(result?.isWiki).toBe(true);
    expect(result?.destination).toBe('MyNote');
  });

  it('parseClipboardLink should parse Markdown links', () => {
    const result = parseClipboardLink('[text](dest.md)');
    expect(result).toBeDefined();
    expect(result?.isWiki).toBe(false);
    expect(result?.destination).toBe('dest.md');
  });

  it('parseClipboardLink should return null for plain text', () => {
    expect(parseClipboardLink('just plain text')).toBeNull();
  });

  it('parseClipboardLink should return null for empty string', () => {
    expect(parseClipboardLink('')).toBeNull();
  });
});

describe('Link Detection at Cursor', () => {
  it('detectLinkAtCursor should find WikiLinks', () => {
    const text = 'This is [[MyNote]] here';
    const result = detectLinkAtCursor(text, 12);
    expect(result).toBeDefined();
    expect(result?.link.isWiki).toBe(true);
    expect(result?.link.destination).toBe('MyNote');
  });

  it('detectLinkAtCursor should find Markdown links', () => {
    const text = 'This is [link](dest.md) here';
    const result = detectLinkAtCursor(text, 12);
    expect(result).toBeDefined();
    expect(result?.link.isWiki).toBe(false);
    expect(result?.link.destination).toBe('dest.md');
  });

  it('detectLinkAtCursor should return null if no link', () => {
    const text = 'This is plain text';
    expect(detectLinkAtCursor(text, 10)).toBeNull();
  });
});

describe('Link Validation', () => {
  it('validateLinkDestination should accept valid WikiLink destinations', () => {
    const result = validateLinkDestination('MyNote', 'text', true);
    expect(result.isValid).toBe(true);
  });

  it('validateLinkDestination should reject URLs for WikiLinks', () => {
    const result = validateLinkDestination('https://example.com', 'text', true);
    expect(result.isValid).toBe(false);
  });

  it('validateLinkDestination should accept URLs for Markdown links', () => {
    const result = validateLinkDestination('https://example.com', 'text', false);
    expect(result.isValid).toBe(true);
  });

  it('validateLinkDestination allows empty destinations (UI layer enforces requirement)', () => {
    const result = validateLinkDestination('', 'text', true);
    expect(result.isValid).toBe(true);
    expect(result.warnings.length).toBe(0);
  });

  it('validateLinkDestination should warn about forbidden characters', () => {
    const result = validateLinkDestination('file|with|pipes', 'text', true);
    expect(result.isValid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
