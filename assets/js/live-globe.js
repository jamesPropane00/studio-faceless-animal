// live-globe.js — Faceless Animal Studios
// Lightweight, dark-themed, auto-rotating globe with glowing user dots
// Fallback/demo mode included. Modular, no dependencies.

(function() {
  const GLOBE_WIDTH = 220;
  const GLOBE_HEIGHT = 110;
  const ROTATE_SPEED = 0.008; // radians per frame
  const DOT_COLOR = 'rgba(201,169,110,0.92)';
  const DOT_GLOW = '0 0 10px 4px rgba(201,169,110,0.45)';
  const DEMO_USERS = [
    // Rough/sanitized lat/lon pairs (not real user data)
    { lat: 40.7, lon: -74.0 },   // NYC
    { lat: 51.5, lon: -0.1 },    // London
    { lat: 35.7, lon: 139.7 },   // Tokyo
    { lat: 48.8, lon: 2.3 },     // Paris
    { lat: 34.0, lon: -118.2 },  // LA
    { lat: 41.9, lon: 12.5 },    // Rome
    { lat: 52.5, lon: 13.4 },    // Berlin
    { lat: 37.8, lon: -122.4 },  // SF
    { lat: -33.9, lon: 151.2 },  // Sydney
    { lat: 55.7, lon: 37.6 },    // Moscow
    { lat: 19.4, lon: -99.1 },   // Mexico City
    { lat: 28.6, lon: 77.2 },    // Delhi
  ];

  function $(sel, root=document) { return root.querySelector(sel); }

  function project(lat, lon, rot) {
    // Equirectangular projection with simple Y rotation
    const rad = Math.PI / 180;
    const phi = (90 - lat) * rad;
    const theta = (lon + rot) * rad;
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);
    // Only show front hemisphere
    if (z < 0) return null;
    // 3D to 2D
    const px = GLOBE_WIDTH/2 + x * (GLOBE_WIDTH/2 - 18);
    const py = GLOBE_HEIGHT/2 + y * (GLOBE_HEIGHT/2 - 18);
    return { x: px, y: py };
  }

  function drawGlobe(ctx, dots, rot) {
    ctx.clearRect(0, 0, GLOBE_WIDTH, GLOBE_HEIGHT);
    // Globe base
    ctx.save();
    ctx.beginPath();
    ctx.arc(GLOBE_WIDTH/2, GLOBE_HEIGHT/2, GLOBE_HEIGHT/2-2, 0, 2*Math.PI);
    ctx.fillStyle = '#181a22';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();
    // Wireframe
    ctx.save();
    ctx.strokeStyle = 'rgba(201,169,110,0.10)';
    ctx.lineWidth = 1.1;
    for (let i=1; i<5; ++i) {
      ctx.beginPath();
      ctx.arc(GLOBE_WIDTH/2, GLOBE_HEIGHT/2, (GLOBE_HEIGHT/2-2)*i/4, 0, 2*Math.PI);
      ctx.stroke();
    }
    for (let i=0; i<6; ++i) {
      ctx.beginPath();
      const a = i*Math.PI/3;
      ctx.ellipse(GLOBE_WIDTH/2, GLOBE_HEIGHT/2, GLOBE_WIDTH/2-2, GLOBE_HEIGHT/2-2, a, 0, 2*Math.PI);
      ctx.stroke();
    }
    ctx.restore();
    // Dots
    for (const d of dots) {
      const p = project(d.lat, d.lon, rot*57.3);
      if (!p) continue;
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, 2*Math.PI);
      ctx.fillStyle = DOT_COLOR;
      ctx.shadowColor = DOT_COLOR;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.restore();
    }
  }

  function fetchPresence(cb) {
    fetch('/api/presence-map').then(r => r.json()).then(data => {
      if (Array.isArray(data) && data.length) cb(data)
      else cb(DEMO_USERS)
    }).catch(() => cb(DEMO_USERS));
  }

  function initLiveGlobe() {
    const el = $('#live-globe-widget');
    if (!el) return;
    const canvas = document.createElement('canvas');
    canvas.width = GLOBE_WIDTH;
    canvas.height = GLOBE_HEIGHT;
    canvas.style.width = '100%';
    canvas.style.maxWidth = GLOBE_WIDTH+'px';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';
    canvas.style.background = 'transparent';
    el.appendChild(canvas);
    let dots = DEMO_USERS;
    let rot = 0;
    fetchPresence(arr => { dots = arr; updateCount(arr.length); });
    function updateCount(n) {
      const label = $('#live-globe-count');
      if (label) label.textContent = n > 0 ? `${n} users online now` : '';
    }
    function animate() {
      rot += ROTATE_SPEED;
      drawGlobe(canvas.getContext('2d'), dots, rot);
      requestAnimationFrame(animate);
    }
    animate();
  }

  document.addEventListener('DOMContentLoaded', initLiveGlobe);
})();
