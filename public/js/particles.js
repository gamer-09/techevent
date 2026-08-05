/* TECHEVENT particle field — WebGL point sprites with 2D-canvas fallback.
   Zero dependencies. Drifting cyan/blue/indigo embers, subtle mouse parallax. */

(function () {
  'use strict';

  const canvas = document.getElementById('particles');
  if (!canvas) return;

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  let gl = null;
  try {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false })
      || canvas.getContext('experimental-webgl', { alpha: true });
  } catch (e) { gl = null; }

  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

  window.addEventListener('mousemove', (ev) => {
    mouse.tx = ev.clientX / window.innerWidth;
    mouse.ty = ev.clientY / window.innerHeight;
  }, { passive: true });

  function resize(cw, ch) {
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
  }

  /* ================= WebGL path ================= */

  function initWebGL() {
    const vsSrc = [
      'attribute vec2 aPos;',
      'attribute float aSize;',
      'attribute float aPhase;',
      'attribute vec3 aColor;',
      'uniform float uTime;',
      'uniform vec2 uMouse;',
      'varying vec3 vColor;',
      'varying float vAlpha;',
      'void main(){',
      '  float t = mod(uTime * 0.05 + aPhase, 1.0);',
      '  vec2 p = aPos;',
      '  p.y = mod(p.y - t * 1.05, 1.35) - 0.175;',
      '  p.x += sin(uTime * 0.12 + aPhase * 18.0) * 0.006;',
      '  vec2 d = p - uMouse;',
      '  float dist = length(d);',
      '  if (dist < 0.16) { p += (d + 1e-6) / (dist + 1e-6) * (0.16 - dist) * 1.1; }',
      '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
      '  gl_PointSize = aSize;',
      '  vColor = aColor;',
      '  vAlpha = (1.0 - abs(t - 0.5) * 2.0);',
      '}'
    ].join('\n');

    const fsSrc = [
      'precision mediump float;',
      'varying vec3 vColor;',
      'varying float vAlpha;',
      'void main(){',
      '  vec2 uv = gl_PointCoord - 0.5;',
      '  float d = length(uv);',
      '  float glow = smoothstep(0.5, 0.05, d);',
      '  gl_FragColor = vec4(vColor, glow * vAlpha * 0.55);',
      '}'
    ].join('\n');

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('TECHEVENT shader error:', gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('TECHEVENT program error:', gl.getProgramInfoLog(prog));
      return false;
    }
    gl.useProgram(prog);

    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uMouse = gl.getUniformLocation(prog, 'uMouse');

    const N = 260;
    const palette = [
      [0.16, 0.85, 0.95], // cyan
      [0.28, 0.55, 0.98], // blue
      [0.52, 0.56, 0.99], // indigo
      [0.85, 0.95, 1.0],  // white
    ];

    const pos = new Float32Array(N * 2);
    const size = new Float32Array(N);
    const phase = new Float32Array(N);
    const col = new Float32Array(N * 3);

    let maxPoint = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64;
    maxPoint = Math.min(maxPoint, 32);

    for (let i = 0; i < N; i++) {
      pos[i * 2] = Math.random();
      pos[i * 2 + 1] = Math.random();
      size[i] = 1.5 + Math.random() * Math.min(4.5, maxPoint - 1);
      phase[i] = Math.random();
      const c = palette[Math.floor(Math.random() * palette.length)];
      const dim = 0.55 + Math.random() * 0.45;
      col[i * 3] = c[0] * dim;
      col[i * 3 + 1] = c[1] * dim;
      col[i * 3 + 2] = c[2] * dim;
    }

    function buffer(name, data, itemSize) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, itemSize, gl.FLOAT, false, 0, 0);
    }

    buffer('aPos', pos, 2);
    buffer('aSize', size, 1);
    buffer('aPhase', phase, 1);
    buffer('aColor', col, 3);

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    resize(window.innerWidth, window.innerHeight);

    const start = performance.now();
    let raf = 0;

    function frame(now) {
      const t = (now - start) / 1000;
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.POINTS, 0, N);
      raf = requestAnimationFrame(frame);
    }

    if (reduce) {
      frame(start);
    } else {
      raf = requestAnimationFrame(frame);
    }

    window.addEventListener('resize', () => resize(window.innerWidth, window.innerHeight));
    return true;
  }

  /* ================= 2D canvas fallback ================= */

  function init2D() {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    resize(window.innerWidth, window.innerHeight);
    const N = 120;
    const parts = [];
    const colors = ['34,211,238', '59,130,246', '129,140,248', '160,200,255'];

    for (let i = 0; i < N; i++) {
      parts.push({
        x: Math.random(), y: Math.random(),
        r: 0.8 + Math.random() * 2.4,
        v: 0.0006 + Math.random() * 0.0018,
        drift: (Math.random() - 0.5) * 0.0004,
        a: 0.12 + Math.random() * 0.4,
        c: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let raf = 0;
    const start = performance.now();

    function frame(now) {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        const yy = (p.y - t * p.v * 0.5 + 100) % 1;
        const x = p.x + Math.sin(t * 0.2 + p.y * 20) * 0.004 + mouse.tx * 0.002;
        const fade = Math.sin(yy * Math.PI); // fade in/out top->bottom
        ctx.fillStyle = `rgba(${p.c},${(p.a * fade).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x * canvas.width, yy * canvas.height, p.r * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }

    if (reduce) frame(start); else raf = requestAnimationFrame(frame);
    window.addEventListener('resize', () => resize(window.innerWidth, window.innerHeight));
  }

  if (gl) {
    if (!initWebGL()) init2D();
  } else {
    init2D();
  }
})();
