/**
 * pdfilove - Scroll reveal
 *
 * Adds `.is-visible` to `[data-reveal]` elements as they scroll into view, and can
 * stagger the direct children of a `[data-reveal-group]`.
 *
 * Progressive enhancement: if IntersectionObserver is unavailable, or the visitor
 * prefers reduced motion, every element is shown immediately.
 */

const REVEAL_SELECTOR = '[data-reveal], [data-reveal-group]';
const REVEAL_ROOT_MARGIN = '0px 0px -12% 0px';
const STAGGER_MS = 70;
const MAX_STAGGER_STEPS = 8;

/** @param {Element} element */
function reveal(element) {
  element.classList.add('is-visible');
}

/**
 * Reveal a container and stagger its children (used for card grids).
 * @param {HTMLElement} container
 */
function revealGroup(container) {
  const children = Array.from(container.children);
  children.forEach((child, index) => {
    const step = Math.min(index, MAX_STAGGER_STEPS);
    /** @type {HTMLElement} */ (child).style.setProperty('--reveal-delay', `${step * STAGGER_MS}ms`);
  });
  reveal(container);
  children.forEach(reveal);
}

/** @returns {boolean} */
function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Start observing reveal targets.
 * Safe to call more than once: already-visible elements are skipped.
 */
export function initScrollReveal() {
  const targets = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll(REVEAL_SELECTOR)));

  // No observer support, or motion is unwelcome: show everything straight away and
  // keep doing so for content injected later.
  if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
    const showAll = () => {
      document.querySelectorAll('[data-reveal-group]').forEach((group) => {
        revealGroup(/** @type {HTMLElement} */ (group));
      });
      document.querySelectorAll('[data-reveal]').forEach(reveal);
    };
    showAll();
    document.addEventListener('pdfilove:reveal', showAll);
    return () => document.removeEventListener('pdfilove:reveal', showAll);
  }

  /** @type {Set<Element>} */
  const observed = new Set();

  // Created on first use so pages without reveal targets never allocate one.
  /** @type {IntersectionObserver|null} */
  let observer = null;
  const getObserver = () => (observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = /** @type {HTMLElement} */ (entry.target);
      if (element.hasAttribute('data-reveal-group')) {
        revealGroup(element);
      } else {
        reveal(element);
      }
      observer?.unobserve(element);
    }
  }, {
    root: null,
    rootMargin: REVEAL_ROOT_MARGIN,
    threshold: 0.08
  }));

  /**
   * Queue an element for reveal. Content already on screen (a hash jump, cards
   * injected after boot) is shown immediately so nothing flashes or gets stuck.
   * @param {HTMLElement} element
   */
  const observe = (element) => {
    if (observed.has(element) || element.classList.contains('is-visible')) return;
    observed.add(element);

    const rect = element.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
    if (inViewport) {
      if (element.hasAttribute('data-reveal-group')) revealGroup(element);
      else reveal(element);
      return;
    }
    getObserver().observe(element);
  };

  targets.forEach(observe);

  // Content rendered later (cards injected after boot, modal bodies) opts in by
  // dispatching this event after inserting markup.
  const rescan = () => {
    document.querySelectorAll(REVEAL_SELECTOR).forEach((element) => {
      observe(/** @type {HTMLElement} */ (element));
    });
  };
  document.addEventListener('pdfilove:reveal', rescan);

  return () => {
    observer?.disconnect();
    observed.clear();
    document.removeEventListener('pdfilove:reveal', rescan);
  };
}
