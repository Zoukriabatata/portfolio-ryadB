'use client';

import { useEffect, useRef, type RefObject } from 'react';

export default function BlackHole({ scrollContainerRef }: { scrollContainerRef: RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scrollEl = scrollContainerRef.current;
    if (!canvas || !scrollEl) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReducedMotion = motionQuery.matches;
    const isMobile = window.innerWidth < 768;

    let w: number, viewH: number, fullH: number, cx: number, cy: number, R: number;
    let dpr: number;
    let lastFullH = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      viewH = window.innerHeight;
      fullH = Math.max(scrollEl.scrollHeight, viewH);

      if (Math.abs(fullH - lastFullH) > 50 || canvas.width !== w * dpr) {
        const cappedH = Math.min(fullH, viewH * 4);
        canvas.width = w * dpr;
        canvas.height = cappedH * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = cappedH + 'px';
        lastFullH = fullH;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = w / 2;
      cy = viewH * 0.44;
      R = Math.min(w, viewH) * 0.18;
    };
    resize();

    // Stars — with parallax depth layers
    const bgStars = Array.from({ length: isMobile ? 350 : 700 }, () => {
      const depth = Math.random(); // 0=far, 1=near
      return {
        x: Math.random(),
        y: Math.random(),
        r: 0.2 + depth * 1.2,
        a: 0.08 + depth * 0.45,
        ts: 0.004 + Math.random() * 0.012,
        to: Math.random() * Math.PI * 2,
        parallax: 0.02 + depth * 0.08, // near stars move more
      };
    });

    // Dust motes
    const dustMotes = Array.from({ length: isMobile ? 25 : 60 }, () => ({
      x: Math.random() * 2000,
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.02,
      r: 0.5 + Math.random() * 1.5,
      a: 0.03 + Math.random() * 0.07,
      hue: 20 + Math.random() * 30,
    }));

    // Secondary gravitational distortions
    const TILT = 0.28;

    const secondaryBHs = [
      { normX: 0.08, yMul: 0.70, radiusFrac: 0.18, intensity: 0.85, phase: 0, pulse: 0.0007 },
      { normX: 0.89, yMul: 0.35, radiusFrac: 0.05, intensity: 0.35, phase: 3.1, pulse: 0.0016 },
      { normX: 0.91, yMul: 0.85, radiusFrac: 0.10, intensity: 0.60, phase: 1.8, pulse: 0.0011 },
    ].map(bh => ({ ...bh, absX: 0, absY: 0, absR: 0 }));

    const updateSecondaryBHPositions = () => {
      secondaryBHs.forEach(bh => {
        bh.absX = bh.normX * w;
        bh.absY = viewH * bh.yMul;
        bh.absR = R * bh.radiusFrac;
      });
    };
    updateSecondaryBHPositions();

    // Horizontal accretion disk
    const diskCount = isMobile ? 250 : 600;
    const disk = Array.from({ length: diskCount }, () => {
      const orbitR = 1.2 + Math.random() * 3.5;
      const isInner = orbitR < 2.2;
      return {
        angle: Math.random() * Math.PI * 2,
        orbitR,
        baseOrbitR: orbitR,
        yOff: (Math.random() - 0.5) * (isInner ? 0.04 : 0.07) * orbitR,
        speed: (0.004 + Math.random() * 0.007) / Math.pow(orbitR, 0.65),
        drift: 0.00003 + Math.random() * 0.00005,
        size: isInner ? (0.4 + Math.random() * 1.8) : (0.3 + Math.random() * 1.0),
        baseHue: isInner ? (25 + Math.random() * 20) : (15 + Math.random() * 25),
        br: isInner ? (0.5 + Math.random() * 0.5) : (0.25 + Math.random() * 0.55),
        isInner,
      };
    });

    // Vertical lensing ring
    const lensRingCount = isMobile ? 120 : 300;
    const lensRing = Array.from({ length: lensRingCount }, () => {
      const orbitR = 1.15 + Math.random() * 1.0;
      return {
        angle: Math.random() * Math.PI * 2,
        orbitR,
        speed: (0.004 + Math.random() * 0.006) / Math.pow(orbitR, 0.5),
        size: 0.3 + Math.random() * 1.2,
        baseHue: 25 + Math.random() * 30,
        br: 0.3 + Math.random() * 0.7,
      };
    });

    // Infalling matter streaks
    const streaks = Array.from({ length: isMobile ? 10 : 25 }, () => ({
      angle: Math.random() * Math.PI * 2,
      dist: 3 + Math.random() * 7,
      speed: 0.0015 + Math.random() * 0.003,
      len: 0.3 + Math.random() * 0.9,
      alpha: 0.06 + Math.random() * 0.14,
    }));

    let raf: number;
    let t = 0;

    const projDisk = (angle: number, orbitR: number, yOff: number) => {
      const x3 = Math.cos(angle) * orbitR;
      const z3 = Math.sin(angle) * orbitR;
      return {
        px: cx + x3 * R,
        py: cy + z3 * TILT * R + yOff * R,
        depth: z3,
        cosA: Math.cos(angle),
      };
    };

    const projLens = (angle: number, orbitR: number) => {
      const x3 = Math.cos(angle) * orbitR * 0.35;
      const y3 = Math.sin(angle) * orbitR;
      return {
        px: cx + x3 * R,
        py: cy - y3 * R,
        depth: Math.cos(angle),
      };
    };

    const canvasH = () => parseInt(canvas.style.height) || viewH;

    const draw = () => {
      t++;
      const scrollY = scrollEl.scrollTop;
      const visTop = scrollY - viewH;
      const visBot = scrollY + viewH * 2;
      const cH = canvasH();

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, cH);

      // Stars with parallax
      bgStars.forEach((s) => {
        const parallaxOffset = scrollY * s.parallax;
        const sy = s.y * cH - parallaxOffset;
        if (sy < visTop || sy > visBot) return;
        const tw = 0.5 + 0.5 * Math.sin(t * s.ts + s.to);
        ctx.fillStyle = `rgba(210,220,255,${s.a * tw})`;
        ctx.beginPath();
        ctx.arc(s.x * w, sy, s.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Dust motes
      dustMotes.forEach((d) => {
        d.x += d.vx;
        d.y += d.vy * 0.0001;
        if (d.x < 0) d.x = w;
        if (d.x > w) d.x = 0;
        if (d.y > 1) d.y = 0;
        if (d.y < 0) d.y = 1;
        const dy = d.y * cH;
        if (dy < visTop || dy > visBot) return;
        ctx.fillStyle = `hsla(${d.hue},60%,60%,${d.a})`;
        ctx.beginPath();
        ctx.arc(d.x % w, dy, d.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Secondary gravitational distortions
      secondaryBHs.forEach(bh => {
        const bhR = bh.absR;
        const bhX = bh.absX;
        const bhY = bh.absY;

        if (bhY < visTop - bhR * 6 || bhY > visBot + bhR * 6) return;
        if (bhR < 3) return;

        const pulse = 1 + Math.sin(t * bh.pulse + bh.phase) * 0.1;
        const intens = bh.intensity * pulse;

        const lg = ctx.createRadialGradient(bhX, bhY, bhR * 1.3, bhX, bhY, bhR * 6);
        lg.addColorStop(0, `rgba(255,190,110,${0.05 * intens})`);
        lg.addColorStop(0.25, `rgba(255,160,80,${0.03 * intens})`);
        lg.addColorStop(0.5, `rgba(255,140,60,${0.015 * intens})`);
        lg.addColorStop(0.75, `rgba(255,120,50,${0.008 * intens})`);
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.arc(bhX, bhY, bhR * 6, 0, Math.PI * 2);
        ctx.fill();

        const dg = ctx.createRadialGradient(bhX, bhY, 0, bhX, bhY, bhR * 2.5);
        dg.addColorStop(0, `rgba(0,0,0,${0.9 * intens})`);
        dg.addColorStop(0.35, `rgba(0,0,0,${0.6 * intens})`);
        dg.addColorStop(0.65, `rgba(0,0,0,${0.2 * intens})`);
        dg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.arc(bhX, bhY, bhR * 2.5, 0, Math.PI * 2);
        ctx.fill();

        const vg = ctx.createRadialGradient(bhX, bhY, 0, bhX, bhY, bhR * 1.1);
        vg.addColorStop(0, 'rgba(0,0,0,1)');
        vg.addColorStop(0.6, `rgba(0,0,0,${0.95 * intens})`);
        vg.addColorStop(0.85, `rgba(0,0,0,${0.4 * intens})`);
        vg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = vg;
        ctx.beginPath();
        ctx.arc(bhX, bhY, bhR * 1.1, 0, Math.PI * 2);
        ctx.fill();

        if (bhR > 8) {
          ctx.save();
          ctx.shadowColor = `rgba(255,180,80,${0.3 * intens})`;
          ctx.shadowBlur = Math.min(bhR * 0.4, 12);
          ctx.strokeStyle = `rgba(255,195,100,${0.22 * intens})`;
          ctx.lineWidth = Math.max(0.5, bhR * 0.03);
          ctx.beginPath();
          ctx.ellipse(bhX, bhY, bhR * 1.02, bhR * TILT * 1.02, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      });

      // Main black hole
      const bhVisible = cy > visTop - R * 5 && cy < visBot + R * 5;

      if (bhVisible) {
        // Nebula glow — orange core
        const ng = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 7);
        ng.addColorStop(0, 'rgba(255,150,50,0.15)');
        ng.addColorStop(0.12, 'rgba(255,120,35,0.10)');
        ng.addColorStop(0.25, 'rgba(255,100,20,0.06)');
        ng.addColorStop(0.4, 'rgba(200,70,15,0.035)');
        ng.addColorStop(0.6, 'rgba(150,50,10,0.015)');
        ng.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ng;
        ctx.fillRect(0, 0, w, viewH);

        // Secondary nebula — violet haze for depth
        const vn = ctx.createRadialGradient(cx + R * 0.5, cy - R * 0.3, R * 0.5, cx + R * 0.5, cy - R * 0.3, R * 5);
        vn.addColorStop(0, 'rgba(120,60,220,0.05)');
        vn.addColorStop(0.3, 'rgba(100,40,200,0.025)');
        vn.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = vn;
        ctx.fillRect(0, 0, w, viewH);

        // Back half of horizontal disk
        disk.forEach((p) => {
          p.angle += p.speed;
          p.orbitR -= p.drift;
          if (p.orbitR < 1.15) p.orbitR = p.baseOrbitR;
          const { px, py, depth, cosA } = projDisk(p.angle, p.orbitR, p.yOff);
          if (depth < 0) return;
          const distC = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
          if (distC < R * 0.82) return;

          const doppler = cosA;
          const hue = p.baseHue + doppler * -20;
          const baseLit = p.isInner ? 58 : 48;
          const lit = baseLit + doppler * 20;
          const distFactor = Math.max(0, 1 - (distC / (R * 4)));
          let a = p.br * (1 + doppler * 0.35) * 0.5 * (1 + distFactor * 0.3);
          const inner = p.isInner ? 1.6 : 1;
          a *= inner;
          const sat = p.isInner ? 98 : 92;
          ctx.fillStyle = `hsla(${hue},${sat}%,${lit}%,${Math.min(a, 0.88)})`;
          ctx.beginPath();
          ctx.arc(px, py, p.size * inner, 0, Math.PI * 2);
          ctx.fill();
        });

        // Back half of vertical lensing ring
        lensRing.forEach((p) => {
          p.angle += p.speed;
          const { px, py, depth } = projLens(p.angle, p.orbitR);
          if (depth > 0) return;
          const distC = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
          if (distC < R * 0.8) return;
          const a = p.br * 0.3;
          ctx.fillStyle = `hsla(${p.baseHue},90%,55%,${Math.min(a, 0.6)})`;
          ctx.beginPath();
          ctx.arc(px, py, p.size * 0.9, 0, Math.PI * 2);
          ctx.fill();
        });

        // Infalling streaks
        streaks.forEach((s) => {
          s.dist -= s.speed;
          if (s.dist < 1.2) {
            s.dist = 3 + Math.random() * 7;
            s.angle = Math.random() * Math.PI * 2;
          }
          s.angle += 0.004 / s.dist;
          const x1 = cx + Math.cos(s.angle) * s.dist * R;
          const y1 = cy + Math.sin(s.angle) * s.dist * R * TILT;
          const x2 = cx + Math.cos(s.angle - s.len / s.dist) * (s.dist + s.len) * R;
          const y2 = cy + Math.sin(s.angle - s.len / s.dist) * (s.dist + s.len) * R * TILT;
          const g = ctx.createLinearGradient(x2, y2, x1, y1);
          g.addColorStop(0, 'rgba(255,140,50,0)');
          g.addColorStop(1, `rgba(255,180,80,${s.alpha})`);
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        });

        // Black hole void
        const vg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.2);
        vg.addColorStop(0, 'rgba(0,0,0,1)');
        vg.addColorStop(0.65, 'rgba(0,0,0,1)');
        vg.addColorStop(0.78, 'rgba(0,0,0,0.99)');
        vg.addColorStop(0.88, 'rgba(0,0,0,0.92)');
        vg.addColorStop(0.95, 'rgba(0,0,0,0.5)');
        vg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = vg;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Photon sphere
        for (let i = 0; i < 3; i++) {
          ctx.save();
          const rad = R * (1.02 + i * 0.06);
          const blur = 8 + i * 12;
          const alpha = 0.3 - i * 0.08;
          const lw = 2.5 - i * 0.6;
          ctx.shadowColor = `rgba(255,170,60,${alpha})`;
          ctx.shadowBlur = blur;
          ctx.strokeStyle = `rgba(255,190,80,${alpha * 0.7})`;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rad, rad * TILT, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Bright photon ring
        ctx.save();
        ctx.shadowColor = 'rgba(255,200,100,0.8)';
        ctx.shadowBlur = 6;
        ctx.strokeStyle = 'rgba(255,210,130,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * 1.01, R * TILT * 1.01, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Front half of vertical lensing ring
        lensRing.forEach((p) => {
          const { px, py, depth } = projLens(p.angle, p.orbitR);
          if (depth <= 0) return;
          const distC = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
          if (distC < R * 0.8) return;
          const a = p.br * 0.55;
          const inner = p.orbitR < 1.4 ? 1.3 : 1;
          ctx.fillStyle = `hsla(${p.baseHue},90%,58%,${Math.min(a * inner, 0.8)})`;
          ctx.beginPath();
          ctx.arc(px, py, p.size * inner, 0, Math.PI * 2);
          ctx.fill();
        });

        // Front half of horizontal disk
        disk.forEach((p) => {
          const { px, py, depth, cosA } = projDisk(p.angle, p.orbitR, p.yOff);
          if (depth >= 0) return;
          const distC = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
          if (distC < R * 0.82) return;

          const doppler = cosA;
          const hue = p.baseHue + doppler * -22;
          const baseLit = p.isInner ? 65 : 52;
          const lit = baseLit + doppler * 22;
          const distFactor = Math.max(0, 1 - (distC / (R * 4)));
          let a = p.br * (1 + doppler * 0.4) * (1 + distFactor * 0.4);
          const inner = p.isInner ? 1.7 : 1;
          a *= inner;
          const sat = p.isInner ? 98 : 92;
          ctx.fillStyle = `hsla(${hue},${sat}%,${lit}%,${Math.min(a, 0.92)})`;
          ctx.beginPath();
          ctx.arc(px, py, p.size * inner, 0, Math.PI * 2);
          ctx.fill();
        });

        // Top lensing arc
        ctx.save();
        ctx.shadowColor = 'rgba(255,180,70,0.5)';
        ctx.shadowBlur = 25;
        const arcGrad = ctx.createLinearGradient(cx - R * 1.8, cy, cx + R * 1.8, cy);
        arcGrad.addColorStop(0, 'rgba(255,180,70,0)');
        arcGrad.addColorStop(0.2, 'rgba(255,180,70,0.08)');
        arcGrad.addColorStop(0.4, 'rgba(255,200,100,0.15)');
        arcGrad.addColorStop(0.5, 'rgba(255,220,140,0.2)');
        arcGrad.addColorStop(0.6, 'rgba(255,200,100,0.15)');
        arcGrad.addColorStop(0.8, 'rgba(255,180,70,0.08)');
        arcGrad.addColorStop(1, 'rgba(255,180,70,0)');
        ctx.strokeStyle = arcGrad;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * 1.15, R * 0.85, 0, Math.PI + 0.15, Math.PI * 2 - 0.15);
        ctx.stroke();
        ctx.strokeStyle = arcGrad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * 1.1, R * 0.8, 0, Math.PI + 0.2, Math.PI * 2 - 0.2);
        ctx.stroke();
        ctx.restore();

        // Bottom lensing arc
        ctx.save();
        ctx.shadowColor = 'rgba(255,150,50,0.2)';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = 'rgba(255,160,60,0.07)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * 1.1, R * 0.75, 0, 0.2, Math.PI - 0.2);
        ctx.stroke();
        ctx.restore();

        // Relativistic jets (subtle glow above and below)
        const jetPulse = 0.7 + 0.3 * Math.sin(t * 0.008);
        // Top jet
        const topJet = ctx.createLinearGradient(cx, cy - R, cx, cy - R * 4);
        topJet.addColorStop(0, `rgba(180,140,255,${0.06 * jetPulse})`);
        topJet.addColorStop(0.3, `rgba(140,100,255,${0.03 * jetPulse})`);
        topJet.addColorStop(1, 'rgba(100,60,255,0)');
        ctx.fillStyle = topJet;
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.08, cy - R);
        ctx.lineTo(cx + R * 0.08, cy - R);
        ctx.lineTo(cx + R * 0.03, cy - R * 3.5);
        ctx.lineTo(cx - R * 0.03, cy - R * 3.5);
        ctx.closePath();
        ctx.fill();
        // Bottom jet
        const botJet = ctx.createLinearGradient(cx, cy + R * TILT, cx, cy + R * 3);
        botJet.addColorStop(0, `rgba(180,140,255,${0.04 * jetPulse})`);
        botJet.addColorStop(0.3, `rgba(140,100,255,${0.02 * jetPulse})`);
        botJet.addColorStop(1, 'rgba(100,60,255,0)');
        ctx.fillStyle = botJet;
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.06, cy + R * TILT);
        ctx.lineTo(cx + R * 0.06, cy + R * TILT);
        ctx.lineTo(cx + R * 0.02, cy + R * 2.5);
        ctx.lineTo(cx - R * 0.02, cy + R * 2.5);
        ctx.closePath();
        ctx.fill();

        // Inner glow ring (hot gas just outside event horizon)
        ctx.save();
        ctx.shadowColor = 'rgba(255,220,150,0.6)';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = 'rgba(255,230,170,0.12)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * 0.95, R * TILT * 0.95, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Vignette effect for depth
        const vig = ctx.createRadialGradient(cx, cy, R * 2, cx, cy, Math.max(w, viewH) * 0.7);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(0.5, 'rgba(0,0,0,0.15)');
        vig.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, w, viewH);
      } else {
        disk.forEach((p) => {
          p.angle += p.speed;
          p.orbitR -= p.drift;
          if (p.orbitR < 1.15) p.orbitR = p.baseOrbitR;
        });
        lensRing.forEach((p) => { p.angle += p.speed; });
        streaks.forEach((s) => {
          s.dist -= s.speed;
          if (s.dist < 1.2) {
            s.dist = 3 + Math.random() * 7;
            s.angle = Math.random() * Math.PI * 2;
          }
          s.angle += 0.004 / s.dist;
        });
      }

      if (!prefersReducedMotion) {
        raf = requestAnimationFrame(draw);
      }
    };

    draw();

    // Pause/resume RAF when reduced motion preference changes
    const onMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
      if (prefersReducedMotion) {
        cancelAnimationFrame(raf);
      } else {
        raf = requestAnimationFrame(draw);
      }
    };
    motionQuery.addEventListener('change', onMotionChange);

    const fullResize = () => {
      resize();
      updateSecondaryBHPositions();
    };
    const resizeObs = new ResizeObserver(() => fullResize());
    resizeObs.observe(scrollEl);
    window.addEventListener('resize', fullResize);

    return () => {
      motionQuery.removeEventListener('change', onMotionChange);
      resizeObs.disconnect();
      window.removeEventListener('resize', fullResize);
      cancelAnimationFrame(raf);
    };
  }, [scrollContainerRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
