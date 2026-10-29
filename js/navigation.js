/**
 * DocuFlow - Navigation & UI Controls
 * Handles mobile hamburger drawer, keyboard navigation, header elevation, and year sync
 */

export function initNavigation() {
  const header = document.querySelector('.site-header');
  const menuToggle = document.querySelector('.menu-toggle');
  const mobileNavOverlay = document.querySelector('.mobile-nav-overlay');
  const mobileNavClose = document.querySelector('.mobile-nav-close');
  const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
  const currentYearEls = document.querySelectorAll('.current-year');

  // Dynamic copyright year
  const currentYear = new Date().getFullYear();
  currentYearEls.forEach(el => {
    el.textContent = currentYear;
  });

  // Header scroll shadow
  if (header) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 10) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }, { passive: true });
  }

  // Open mobile drawer
  function openMobileNav() {
    if (!mobileNavOverlay) return;
    mobileNavOverlay.classList.add('open');
    mobileNavOverlay.setAttribute('aria-hidden', 'false');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  // Close mobile drawer
  function closeMobileNav() {
    if (!mobileNavOverlay) return;
    mobileNavOverlay.classList.remove('open');
    mobileNavOverlay.setAttribute('aria-hidden', 'true');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  if (menuToggle) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      openMobileNav();
    });
  }

  if (mobileNavClose) {
    mobileNavClose.addEventListener('click', closeMobileNav);
  }

  if (mobileNavOverlay) {
    mobileNavOverlay.addEventListener('click', (e) => {
      if (e.target === mobileNavOverlay) {
        closeMobileNav();
      }
    });
  }

  mobileNavLinks.forEach(link => {
    link.addEventListener('click', () => {
      closeMobileNav();
    });
  });

  // Escape key closes drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileNav();
    }
  });
}
