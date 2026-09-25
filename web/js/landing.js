const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('motion-ready');

  const revealObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));
}

const visual = document.querySelector('.hero-visual');
if (visual && !reducedMotion.matches && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  let frame = 0;
  let pointerX = 0;
  let pointerY = 0;

  visual.addEventListener('pointermove', (event) => {
    const bounds = visual.getBoundingClientRect();
    pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      visual.style.setProperty('--tilt-x', `${pointerX * 3}deg`);
      visual.style.setProperty('--tilt-y', `${pointerY * -3}deg`);
      visual.style.setProperty('--glow-x', `${50 + pointerX * 20}%`);
      visual.style.setProperty('--glow-y', `${50 + pointerY * 20}%`);
      frame = 0;
    });
  }, { passive: true });

  visual.addEventListener('pointerleave', () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    visual.style.setProperty('--tilt-x', '0deg');
    visual.style.setProperty('--tilt-y', '0deg');
    visual.style.setProperty('--glow-x', '50%');
    visual.style.setProperty('--glow-y', '50%');
  });
}
