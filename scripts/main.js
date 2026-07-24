// ═══════════════════════════════════════════════════
// SCROLL ANIMATIONS (Intersection Observer)
// ═══════════════════════════════════════════════════
const animObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, {
  threshold: 0.1,
  rootMargin: '0px 0px -40px 0px'
});

document.querySelectorAll('.anim').forEach(el => animObserver.observe(el));

// ═══════════════════════════════════════════════════
// PARALLAX EFFECT
// ═══════════════════════════════════════════════════
const parallaxElements = document.querySelectorAll('.parallax');
const dotGrid = document.getElementById('dotGrid');

let ticking = false;
window.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      const scrollY = window.pageYOffset;

      // Parallax for floating elements
      parallaxElements.forEach(el => {
        const speed = parseFloat(el.dataset.speed) || 0.02;
        const rect = el.getBoundingClientRect();
        const centerOffset = rect.top + rect.height / 2 - window.innerHeight / 2;
        el.style.transform = `translateY(${centerOffset * speed}px)`;
      });

      // Parallax dot grid background
      if (dotGrid) {
        dotGrid.style.transform = `translateY(${scrollY * 0.15}px)`;
      }

      ticking = false;
    });
    ticking = true;
  }
});

// ═══════════════════════════════════════════════════
// FLOW DIAGRAM CONNECTIONS
// ═══════════════════════════════════════════════════
let selectedFeature = null;

function selectFeature(featureId) {
  // Update active node
  document.querySelectorAll('.flow-node').forEach(node => {
    node.classList.toggle('active', node.dataset.feature === featureId);
  });

  // Show/hide detail content
  document.querySelectorAll('.flow-detail-content').forEach(content => {
    content.classList.remove('show');
  });

  const detail = document.getElementById(`detail-${featureId}`);
  if (detail) {
    document.getElementById('detailEmpty').style.display = 'none';
    detail.classList.add('show');
  }

  // Draw SVG connections when section is visible
  if (featureId === 'runtime') {
    drawConnections();
  }

  selectedFeature = featureId;
}

function drawConnections() {
  const paths = document.querySelectorAll('.flow-svg path');
  paths.forEach((path, i) => {
    setTimeout(() => {
      path.classList.add('drawn');
    }, i * 200);
  });
}

// Draw connections when features section comes into view
const featuresObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      drawConnections();
    }
  });
}, { threshold: 0.3 });

const featuresFlow = document.getElementById('featuresFlow');
if (featuresFlow) featuresObserver.observe(featuresFlow);

// ═══════════════════════════════════════════════════
// NAV SCROLL STATE
// ═══════════════════════════════════════════════════
let lastScroll = 0;
window.addEventListener('scroll', () => {
  const nav = document.querySelector('.nav');
  const current = window.pageYOffset;
  if (current > 100) {
    nav.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';
  } else {
    nav.style.boxShadow = 'none';
  }
  lastScroll = current;
});
