/* ============================================
   NAV — scroll state + mobile toggle
   ============================================ */
const nav = document.getElementById('nav');
const hamburger = document.querySelector('.nav__hamburger');
const navLinks = document.querySelector('.nav__links');

window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

hamburger.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  hamburger.setAttribute('aria-expanded', isOpen);
});

// Close mobile nav on link click
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
  });
});

/* ============================================
   SCROLL REVEAL
   ============================================ */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

// Hero elements are always visible — skip them
document.querySelectorAll('.reveal').forEach(el => {
  if (el.closest('.hero')) return; // hero handled by CSS
  revealObserver.observe(el);
});

/* ============================================
   CONTACT FORM
   ============================================ */
const form = document.getElementById('contactForm');
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const name = form.querySelector('#name').value.trim();
    const email = form.querySelector('#email').value.trim();
    const message = form.querySelector('#message').value.trim();

    if (!name || !email || !message) {
      showFormFeedback(form, 'Please fill in all fields.', 'error'); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFormFeedback(form, 'Please enter a valid email address.', 'error'); return;
    }
    btn.textContent = 'Sending...';
    btn.disabled = true;
    setTimeout(() => {
      showFormFeedback(form, "Message sent. I'll be in touch soon.", 'success');
      form.reset();
      btn.textContent = 'Send Message';
      btn.disabled = false;
    }, 1200);
  });
}

function showFormFeedback(form, message, type) {
  let feedback = form.querySelector('.form-feedback');
  if (!feedback) {
    feedback = document.createElement('p');
    feedback.className = 'form-feedback';
    feedback.style.cssText = 'font-size:0.875rem;font-weight:500;padding:0.75rem 1rem;border-radius:8px;margin-top:0;';
    form.appendChild(feedback);
  }
  feedback.textContent = message;
  feedback.style.background = type === 'success' ? '#dcfce7' : '#fee2e2';
  feedback.style.color = type === 'success' ? '#166534' : '#991b1b';
  setTimeout(() => feedback.remove(), 4000);
}

/* ============================================
   ACTIVE NAV LINK
   ============================================ */
const sections = document.querySelectorAll('section[id]');
const navAnchors = document.querySelectorAll('.nav__links a[href^="#"]');

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navAnchors.forEach(a => a.classList.remove('active'));
      const active = document.querySelector(`.nav__links a[href="#${entry.target.id}"]`);
      if (active) active.classList.add('active');
    }
  });
}, { threshold: 0.3 });

sections.forEach(s => sectionObserver.observe(s));
