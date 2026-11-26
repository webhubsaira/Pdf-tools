import { describe, expect, it } from 'vitest';
import { parsePageRanges } from '../js/pdf-tools.js';

describe('parsePageRanges', () => {
  it('expands single pages and ranges in ascending order', () => {
    expect(parsePageRanges('1-3, 5', 10)).toEqual([0, 1, 2, 4]);
    expect(parsePageRanges('3', 10)).toEqual([2]);
  });

  it('deduplicates overlapping selections', () => {
    expect(parsePageRanges('1-3, 2-4', 10)).toEqual([0, 1, 2, 3]);
    expect(parsePageRanges('  2 , 2 ', 10)).toEqual([1]);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parsePageRanges(' 1 - 3 , 5 ', 10)).toEqual([0, 1, 2, 4]);
  });

  it('sorts selections given out of order', () => {
    expect(parsePageRanges('5, 1', 10)).toEqual([0, 4]);
  });

  it('rejects ranges that run past the last page', () => {
    expect(() => parsePageRanges('1-100', 5)).toThrow(/goes past the last page.*5 pages/i);
    expect(() => parsePageRanges('10', 1)).toThrow(/goes past the last page.*1 page\./i);
  });

  it('rejects partially numeric input instead of guessing', () => {
    expect(() => parsePageRanges('3abc', 10)).toThrow(/not a valid page or range/i);
    expect(() => parsePageRanges('1.5', 10)).toThrow(/not a valid page or range/i);
    expect(() => parsePageRanges('1-3-5', 10)).toThrow(/not a valid page or range/i);
  });

  it('rejects backwards ranges with a hint', () => {
    expect(() => parsePageRanges('5-3', 10)).toThrow(/runs backwards.*3-5/i);
  });

  it('rejects page zero', () => {
    expect(() => parsePageRanges('0', 10)).toThrow(/start at 1/i);
    expect(() => parsePageRanges('0-2', 10)).toThrow(/start at 1/i);
  });

  it('rejects empty input', () => {
    expect(() => parsePageRanges('', 10)).toThrow(/at least one page/i);
    expect(() => parsePageRanges('   ', 10)).toThrow(/at least one page/i);
    expect(() => parsePageRanges(null, 10)).toThrow(/at least one page/i);
    expect(() => parsePageRanges(',', 10)).toThrow(/at least one page/i);
  });

  it('handles documents with a single page', () => {
    expect(parsePageRanges('1', 1)).toEqual([0]);
    expect(() => parsePageRanges('2', 1)).toThrow(/1 page\./);
  });
});
