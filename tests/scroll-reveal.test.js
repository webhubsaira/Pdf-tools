/**
 * Scroll-reveal tests: the IntersectionObserver path, the injected-card rescan,
 * and the reduced-motion / no-observer fallbacks that must show content instantly.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Minimal IntersectionObserver double that records observed targets. */
class FakeObserver {
  static instances = [];
  static supported = true;

  /** @param {(entries: any[]) => void} callback */
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    FakeObserver.instances.push(this);
  }

  observe(target) {
    this.targets.add(target);
  }

  unobserve(target) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
  }

  /** Pretend everything still observed has scrolled into view. */
  trigger() {
    const entries = [...this.targets].map((target) => ({ target, isIntersecting: true }));
    this.callback(entries);
  }
}

/** jsdom reports every rect as zero-sized, so stub a viewport for the in-view check. */
function stubViewport() {
  vi.stubGlobal('innerHeight', 800);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    /** @type {DOMRect} */ ({ top: 4000, bottom: 4100, height: 100, width: 100, left: 0, right: 100, x: 0, y: 4000, toJSON: () => ({}) })
  );
}

async function load() {
  vi.resetModules();
  return import('../js/scroll-reveal.js');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  FakeObserver.instances = [];
});

describe('initScrollReveal', () => {
  it('reveals targets as they intersect and stops observing them', async () => {
    document.body.innerHTML = `
      <div data-reveal id="a"></div>
      <div data-reveal id="b"></div>`;
    stubViewport();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { initScrollReveal } = await load();

    initScrollReveal();
    const observer = FakeObserver.instances.at(-1);
    expect(observer.targets.size).toBe(2);
    expect(document.getElementById('a').classList.contains('is-visible')).toBe(false);

    observer.trigger();
    expect(document.getElementById('a').classList.contains('is-visible')).toBe(true);
    expect(document.getElementById('b').classList.contains('is-visible')).toBe(true);
    expect(observer.targets.size).toBe(0);
  });

  it('staggers the children of a reveal group', async () => {
    document.body.innerHTML = `
      <div data-reveal-group id="group">
        <div class="card"></div><div class="card"></div><div class="card"></div>
      </div>`;
    stubViewport();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { initScrollReveal } = await load();

    initScrollReveal();
    FakeObserver.instances.at(-1).trigger();

    const cards = [...document.querySelectorAll('.card')];
    expect(cards.map((card) => card.style.getPropertyValue('--reveal-delay'))).toEqual(['0ms', '70ms', '140ms']);
    expect(cards.every((card) => card.classList.contains('is-visible'))).toBe(true);
  });

  it('picks up markup injected after boot when asked to rescan', async () => {
    document.body.innerHTML = '<div id="grid"></div>';
    stubViewport();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { initScrollReveal } = await load();

    // The observer is lazy: a page with no targets never allocates one.
    initScrollReveal();
    expect(FakeObserver.instances).toHaveLength(0);

    document.getElementById('grid').innerHTML = '<article data-reveal></article>';
    document.dispatchEvent(new CustomEvent('pdfilove:reveal'));
    expect(FakeObserver.instances).toHaveLength(1);
    expect(FakeObserver.instances[0].targets.size).toBe(1);
  });

  it('shows everything immediately when motion is reduced', async () => {
    document.body.innerHTML = '<div data-reveal id="a"></div><div data-reveal-group id="g"><p class="card"></p></div>';
    stubViewport();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('matchMedia', (query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener() {},
      removeEventListener() {}
    }));
    const { initScrollReveal } = await load();

    initScrollReveal();

    expect(FakeObserver.instances).toHaveLength(0);
    expect(document.getElementById('a').classList.contains('is-visible')).toBe(true);
    expect(document.getElementById('g').classList.contains('is-visible')).toBe(true);
    expect(document.querySelector('.card').classList.contains('is-visible')).toBe(true);
  });

  it('falls back to showing everything without IntersectionObserver', async () => {
    document.body.innerHTML = '<div data-reveal id="a"></div>';
    stubViewport();
    vi.stubGlobal('IntersectionObserver', undefined);
    const { initScrollReveal } = await load();

    initScrollReveal();
    expect(document.getElementById('a').classList.contains('is-visible')).toBe(true);
  });

  it('reveals targets already on screen without waiting for the observer', async () => {
    document.body.innerHTML = '<div data-reveal id="a"></div>';
    vi.stubGlobal('innerHeight', 800);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      /** @type {DOMRect} */ ({ top: 100, bottom: 200, height: 100, width: 100, left: 0, right: 100, x: 0, y: 100, toJSON: () => ({}) })
    );
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { initScrollReveal } = await load();

    initScrollReveal();
    expect(document.getElementById('a').classList.contains('is-visible')).toBe(true);
  });

  it('does nothing when a page has no reveal targets', async () => {
    document.body.innerHTML = '<p>plain page</p>';
    stubViewport();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { initScrollReveal } = await load();

    const teardown = initScrollReveal();
    expect(FakeObserver.instances).toHaveLength(0);
    expect(() => teardown()).not.toThrow();
  });

  it('disconnects the observer on teardown', async () => {
    document.body.innerHTML = '<div data-reveal></div>';
    stubViewport();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { initScrollReveal } = await load();

    const teardown = initScrollReveal();
    const observer = FakeObserver.instances.at(-1);
    teardown();
    expect(observer.targets.size).toBe(0);
  });
});
