'use client';

import { useEffect, useState, useRef, type RefObject } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useScrollAnimations } from '@/hooks/useScrollAnimations';
import {
  LiveIcon,
  FootprintIcon,
  HeatmapIcon,
  GexIcon,
  VolatilityIcon,
  ReplayIcon,
} from '@/components/ui/Icons';

// ─── Interstellar Gargantua-style 3D black hole (full-page canvas) ───
function BlackHole({ scrollContainerRef }: { scrollContainerRef: RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scrollEl = scrollContainerRef.current;
    if (!canvas || !scrollEl) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reduced motion: render single static frame
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w: number, viewH: number, fullH: number, cx: number, cy: number, R: number;
    let dpr: number;
    let lastFullH = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      viewH = window.innerHeight;
      fullH = Math.max(scrollEl.scrollHeight, viewH);

      // Only reallocate canvas buffer if height changed significantly
      if (Math.abs(fullH - lastFullH) > 50 || canvas.width !== w * dpr) {
        // Cap canvas height for memory safety (max ~4 viewports)
        const cappedH = Math.min(fullH, viewH * 4);
        canvas.width = w * dpr;
        canvas.height = cappedH * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = cappedH + 'px';
        lastFullH = fullH;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = w / 2;
      cy = viewH * 0.44; // black hole stays in first viewport
      R = Math.min(w, viewH) * 0.18;
    };
    resize();

    // ── Stars (spread across full page height) ──
    const bgStars = Array.from({ length: 600 }, () => ({
      x: Math.random(),
      y: Math.random(), // normalized 0-1, multiplied by fullH
      r: Math.random() * 1.3 + 0.2,
      a: Math.random() * 0.55 + 0.1,
      ts: 0.004 + Math.random() * 0.012,
      to: Math.random() * Math.PI * 2,
    }));

    // ── Ambient dust motes (slow drift across full page) ──
    const dustMotes = Array.from({ length: 80 }, () => ({
      x: Math.random() * 2000, // will be wrapped to w
      y: Math.random(), // normalized, multiplied by fullH
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.02,
      r: 0.5 + Math.random() * 1.5,
      a: 0.03 + Math.random() * 0.07,
      hue: 20 + Math.random() * 30,
    }));

    // ── Secondary ambient black holes (distant gravity wells) ──
    const TILT = 0.28;

    const createSecondaryBH = (
      normX: number, yMultiplier: number, radiusFrac: number, intensity: number, particleCount: number
    ) => ({
      normX,
      yMul: yMultiplier,
      radiusFrac,
      intensity,
      rotationOffset: Math.random() * Math.PI * 2,
      pulseSpeed: 0.001 + Math.random() * 0.002,
      // Absolute values computed in resize
      absX: 0, absY: 0, absR: 0,
      diskParticles: Array.from({ length: particleCount }, () => {
        const orbitR = 1.3 + Math.random() * 2.5;
        return {
          angle: Math.random() * Math.PI * 2,
          orbitR,
          yOff: (Math.random() - 0.5) * 0.06 * orbitR,
          speed: (0.002 + Math.random() * 0.004) / Math.pow(orbitR, 0.6),
          size: 0.3 + Math.random() * 0.8,
          baseHue: 18 + Math.random() * 25,
          br: 0.2 + Math.random() * 0.5,
        };
      }),
    });

    const secondaryBHs = [
      createSecondaryBH(0.12, 1.4, 0.10, 0.28, 60),  // Left of features
      createSecondaryBH(0.88, 1.8, 0.08, 0.22, 50),  // Right of features
      createSecondaryBH(0.92, 2.3, 0.07, 0.18, 40),  // Right, between sections
      createSecondaryBH(0.08, 2.7, 0.09, 0.25, 55),  // Left of CTA
    ];

    const updateSecondaryBHPositions = () => {
      secondaryBHs.forEach(bh => {
        bh.absX = bh.normX * w;
        bh.absY = viewH * bh.yMul;
        bh.absR = R * bh.radiusFrac;
      });
    };
    updateSecondaryBHPositions();

    // ── Horizontal accretion disk (enhanced with more detail) ──
    const diskCount = 2000; // Increased density for more detail
    const disk = Array.from({ length: diskCount }, () => {
      const orbitR = 1.2 + Math.random() * 3.5;
      // Inner disk (hot, bright) vs outer disk (cooler, dimmer)
      const isInner = orbitR < 2.2;
      return {
        angle: Math.random() * Math.PI * 2,
        orbitR,
        yOff: (Math.random() - 0.5) * (isInner ? 0.05 : 0.09) * orbitR,
        speed: (0.005 + Math.random() * 0.009) / Math.pow(orbitR, 0.65),
        size: isInner ? (0.6 + Math.random() * 2.5) : (0.4 + Math.random() * 1.3),
        baseHue: isInner ? (25 + Math.random() * 20) : (15 + Math.random() * 25),
        br: isInner ? (0.5 + Math.random() * 0.5) : (0.25 + Math.random() * 0.55),
        isInner,
      };
    });

    // ── Vertical lensing ring ──
    const lensRingCount = 600;
    const lensRing = Array.from({ length: lensRingCount }, () => {
      const orbitR = 1.15 + Math.random() * 1.0;
      return {
        angle: Math.random() * Math.PI * 2,
        orbitR,
        speed: (0.005 + Math.random() * 0.007) / Math.pow(orbitR, 0.5),
        size: 0.4 + Math.random() * 1.6,
        baseHue: 25 + Math.random() * 30,
        br: 0.3 + Math.random() * 0.7,
      };
    });

    // ── Infalling matter streaks ──
    const streaks = Array.from({ length: 25 }, () => ({
      angle: Math.random() * Math.PI * 2,
      dist: 3 + Math.random() * 7,
      speed: 0.002 + Math.random() * 0.004,
      len: 0.4 + Math.random() * 1.2,
      alpha: 0.08 + Math.random() * 0.18,
    }));

    let raf: number;
    let t = 0;

    // ── Helper: project a disk particle ──
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

    // ── Helper: project a vertical ring particle ──
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

      // ── Stars (viewport culled) ──
      bgStars.forEach((s) => {
        const sy = s.y * cH;
        if (sy < visTop || sy > visBot) return;
        const tw = 0.5 + 0.5 * Math.sin(t * s.ts + s.to);
        ctx.fillStyle = `rgba(210,220,255,${s.a * tw})`;
        ctx.beginPath();
        ctx.arc(s.x * w, sy, s.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // ── Dust motes (viewport culled) ──
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

      // ── Secondary ambient black holes (distant gravity wells) ──
      secondaryBHs.forEach(bh => {
        const bhR = bh.absR;
        const bhX = bh.absX;
        const bhY = bh.absY;

        // Viewport culling
        if (bhY < visTop - bhR * 8 || bhY > visBot + bhR * 8) {
          bh.diskParticles.forEach(p => { p.angle += p.speed; });
          return;
        }

        // Slow pulse (20-30s cycle)
        const pulse = 1 + Math.sin(t * bh.pulseSpeed + bh.rotationOffset) * 0.15;
        const intens = bh.intensity * pulse;

        // Layer 1: Faint nebula glow
        const sg = ctx.createRadialGradient(bhX, bhY, bhR * 0.2, bhX, bhY, bhR * 5);
        sg.addColorStop(0, `rgba(255,140,50,${0.03 * intens})`);
        sg.addColorStop(0.4, `rgba(255,110,30,${0.015 * intens})`);
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(bhX, bhY, bhR * 5, 0, Math.PI * 2);
        ctx.fill();

        // Layer 2: Mini accretion disk (all particles, no front/back sort)
        bh.diskParticles.forEach(p => {
          p.angle += p.speed;
          const x3 = Math.cos(p.angle) * p.orbitR;
          const z3 = Math.sin(p.angle) * p.orbitR;
          const px = bhX + x3 * bhR;
          const py = bhY + z3 * TILT * bhR + p.yOff * bhR;

          const distC = Math.sqrt((px - bhX) ** 2 + (py - bhY) ** 2);
          if (distC < bhR * 0.8) return;

          const hue = p.baseHue + Math.cos(p.angle) * -12;
          const lit = 45 + Math.cos(p.angle) * 15;
          const a = p.br * intens * 0.5;

          ctx.fillStyle = `hsla(${hue},85%,${lit}%,${Math.min(a, 0.55)})`;
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fill();
        });

        // Layer 3: Void + single photon ring
        const vg = ctx.createRadialGradient(bhX, bhY, 0, bhX, bhY, bhR * 1.1);
        vg.addColorStop(0, 'rgba(0,0,0,1)');
        vg.addColorStop(0.6, 'rgba(0,0,0,0.95)');
        vg.addColorStop(0.85, 'rgba(0,0,0,0.7)');
        vg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = vg;
        ctx.beginPath();
        ctx.arc(bhX, bhY, bhR * 1.1, 0, Math.PI * 2);
        ctx.fill();

        // Single photon ring
        ctx.save();
        ctx.shadowColor = `rgba(255,170,60,${0.2 * intens})`;
        ctx.shadowBlur = 4;
        ctx.strokeStyle = `rgba(255,190,80,${0.15 * intens})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(bhX, bhY, bhR * 1.02, bhR * TILT * 1.02, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });

      // ── Main black hole elements (only render if hero is near visible) ──
      const bhVisible = cy > visTop - R * 5 && cy < visBot + R * 5;

      if (bhVisible) {
        // ── Nebula glow (enhanced with more depth) ──
        const ng = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 7);
        ng.addColorStop(0, 'rgba(255,150,50,0.08)');
        ng.addColorStop(0.15, 'rgba(255,120,35,0.05)');
        ng.addColorStop(0.3, 'rgba(255,100,20,0.03)');
        ng.addColorStop(0.5, 'rgba(200,70,15,0.018)');
        ng.addColorStop(0.7, 'rgba(150,50,10,0.008)');
        ng.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ng;
        ctx.fillRect(0, 0, w, viewH);

        // ── Back half of horizontal disk (enhanced with depth and detail) ──
        disk.forEach((p) => {
          p.angle += p.speed;
          const { px, py, depth, cosA } = projDisk(p.angle, p.orbitR, p.yOff);
          if (depth < 0) return;
          const distC = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
          if (distC < R * 0.82) return;

          const doppler = cosA;
          const hue = p.baseHue + doppler * -20;
          const baseLit = p.isInner ? 58 : 48;
          const lit = baseLit + doppler * 20;

          // Distance-based falloff for depth
          const distFactor = Math.max(0, 1 - (distC / (R * 4)));
          let a = p.br * (1 + doppler * 0.35) * 0.5 * (1 + distFactor * 0.3);

          const inner = p.isInner ? 1.6 : 1;
          a *= inner;

          // Higher saturation for inner disk
          const sat = p.isInner ? 98 : 92;
          ctx.fillStyle = `hsla(${hue},${sat}%,${lit}%,${Math.min(a, 0.88)})`;
          ctx.beginPath();
          ctx.arc(px, py, p.size * inner, 0, Math.PI * 2);
          ctx.fill();
        });

        // ── Back half of vertical lensing ring ──
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

        // ── Infalling streaks ──
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

        // ── Black hole void (enhanced with sharper event horizon) ──
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

        // ── Photon sphere ──
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

        // ── Bright photon ring ──
        ctx.save();
        ctx.shadowColor = 'rgba(255,200,100,0.8)';
        ctx.shadowBlur = 6;
        ctx.strokeStyle = 'rgba(255,210,130,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * 1.01, R * TILT * 1.01, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // ── Front half of vertical lensing ring ──
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

        // ── Front half of horizontal disk (brighter, more detailed) ──
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

        // ── Top lensing arc ──
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

        // ── Bottom lensing arc ──
        ctx.save();
        ctx.shadowColor = 'rgba(255,150,50,0.2)';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = 'rgba(255,160,60,0.07)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * 1.1, R * 0.75, 0, 0.2, Math.PI - 0.2);
        ctx.stroke();
        ctx.restore();
      } else {
        // Even when BH is not visible, still animate disk/lensing so they don't "freeze"
        disk.forEach((p) => { p.angle += p.speed; });
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

    const fullResize = () => {
      resize();
      updateSecondaryBHPositions();
    };
    const resizeObs = new ResizeObserver(() => fullResize());
    resizeObs.observe(scrollEl);
    window.addEventListener('resize', fullResize);

    return () => {
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

// ─── Feature Card with mouse-tracking glow ───
function FeatureCard({ f, i }: { f: typeof FEATURES[number]; i: number }) {
  const cardRef = useRef<HTMLAnchorElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mouse-x', `${x}%`);
    card.style.setProperty('--mouse-y', `${y}%`);
  };

  return (
    <Link
      ref={cardRef}
      href={f.href}
      data-animate="up"
      data-animate-delay={String(i + 1)}
      className="feature-card group relative p-5 rounded-lg border border-white/[0.04] bg-white/[0.015]"
      onMouseMove={handleMouseMove}
    >
      {/* Mouse-tracking radial glow */}
      <div
        className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: 'radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(245,158,11,0.06), transparent 70%)',
        }}
      />
      {/* Card content */}
      <div className="relative z-10 flex items-start gap-3.5">
        <div className="feature-icon w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-amber-500/[0.07] transition-all duration-300">
          <f.Icon size={18} color="#f59e0b" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-white/80 group-hover:text-amber-200/90 transition-colors duration-300">
            {f.title}
          </h3>
          <p className="mt-1 text-[11px] text-white/25 leading-relaxed group-hover:text-white/35 transition-colors duration-300">
            {f.desc}
          </p>
        </div>
      </div>
    </Link>
  );
}

// ─── Ambient floating particles (deterministic positions, no hydration mismatch) ───
function AmbientParticles({ count = 8 }: { count?: number }) {
  const particles = Array.from({ length: count }, (_, i) => ({
    left: `${(i * 137.5) % 100}%`,
    top: `${(i * 61.8) % 100}%`,
    size: `${2 + (i % 3) * 1.5}px`,
    alpha: 0.03 + (i % 4) * 0.015,
    duration: `${10 + (i % 5) * 3}s`,
    delay: `${i * -1.7}s`,
  }));

  return (
    <>
      {particles.map((p, i) => (
        <div
          key={i}
          className="ambient-particle"
          style={{
            left: p.left,
            top: p.top,
            '--particle-size': p.size,
            '--particle-a': p.alpha,
            '--particle-duration': p.duration,
            '--particle-delay': p.delay,
          } as React.CSSProperties}
        />
      ))}
    </>
  );
}

const FEATURES = [
  {
    Icon: LiveIcon,
    title: 'Live Trading',
    desc: 'Real-time WebSocket feeds from Binance, Bybit & Deribit',
    href: '/live',
  },
  {
    Icon: FootprintIcon,
    title: 'Footprint Charts',
    desc: 'Bid/ask volume analysis with delta & cumulative delta',
    href: '/footprint',
  },
  {
    Icon: HeatmapIcon,
    title: 'Liquidity Heatmap',
    desc: 'Orderbook depth visualization with passive order detection',
    href: '/liquidity',
  },
  {
    Icon: GexIcon,
    title: 'GEX Dashboard',
    desc: 'Gamma exposure tracking across strikes and expirations',
    href: '/gex',
  },
  {
    Icon: VolatilityIcon,
    title: 'IV Surface',
    desc: 'Volatility smile, term structure & skew analysis',
    href: '/volatility',
  },
  {
    Icon: ReplayIcon,
    title: 'Market Replay',
    desc: 'Frame-by-frame historical session playback',
    href: '/replay',
  },
];

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sessionData = useSession();
  const session = sessionData?.data;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Hook up scroll-triggered animations with the scroll container as root
  useScrollAnimations('[data-scroll-root]');

  if (!mounted) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-black">
        <div className="w-6 h-6 border-2 border-amber-500/60 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      data-scroll-root
      className="h-full w-full overflow-auto bg-black relative"
    >
      {/* ═══════ FULL-PAGE CANVAS BACKGROUND ═══════ */}
      <BlackHole scrollContainerRef={scrollContainerRef} />

      {/* ═══════ HERO ═══════ */}
      <section className="relative min-h-[100vh] flex items-center justify-center px-6 overflow-hidden">
        {/* Content */}
        <div className="relative z-10 max-w-3xl mx-auto text-center">

          {/* Badge */}
          <div
            className="inline-flex items-center gap-2.5 mb-10 px-4 py-1.5 rounded-full text-[11px] tracking-widest uppercase"
            style={{
              color: 'rgba(255,190,100,0.8)',
              border: '1px solid rgba(255,170,60,0.15)',
              background: 'rgba(255,170,60,0.04)',
              backdropFilter: 'blur(8px)',
              animation: 'fadeInDown 0.7s ease-out forwards',
              opacity: 0,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Real-time Analytics
          </div>

          {/* Title */}
          <div style={{ animation: 'fadeInUp 0.9s ease-out 0.1s forwards', opacity: 0 }}>
            <h1 className="font-black tracking-tight leading-[1.05]">
              <span className="block text-4xl md:text-6xl lg:text-7xl text-white/90">
                Professional
              </span>
              <span
                className="block text-5xl md:text-7xl lg:text-8xl mt-1"
                style={{
                  background: 'linear-gradient(135deg, #fbbf24, #f59e0b, #d97706, #fbbf24)',
                  backgroundSize: '200% 100%',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  animation: 'gradientShift 4s ease infinite',
                  filter: 'drop-shadow(0 0 30px rgba(245, 158, 11, 0.25))',
                }}
              >
                Order Flow
              </span>
            </h1>
          </div>

          {/* Subtitle */}
          <p
            className="mt-6 text-sm md:text-base text-white/40 max-w-md mx-auto leading-relaxed"
            style={{ animation: 'fadeInUp 0.7s ease-out 0.3s forwards', opacity: 0 }}
          >
            Institutional-grade market microstructure analysis.
            Heatmaps, footprint charts, gamma exposure — see what others can&apos;t.
          </p>

          {/* CTA */}
          <div
            className="mt-10 flex items-center justify-center gap-3 flex-wrap"
            style={{ animation: 'fadeInUp 0.7s ease-out 0.45s forwards', opacity: 0 }}
          >
            {session ? (
              <Link href="/live" className="landing-btn-primary">
                Open Dashboard
              </Link>
            ) : (
              <>
                <Link href="/auth/register" className="landing-btn-primary">
                  Get Started
                </Link>
                <Link href="/auth/login" className="landing-btn-ghost">
                  Sign In
                </Link>
              </>
            )}
          </div>

          {/* Stats */}
          <div
            className="mt-16 grid grid-cols-4 gap-4 max-w-sm mx-auto"
            style={{ animation: 'fadeInUp 0.7s ease-out 0.6s forwards', opacity: 0 }}
          >
            {[
              { v: '5ms', l: 'Latency' },
              { v: '99.9%', l: 'Uptime' },
              { v: '10+', l: 'Sources' },
              { v: '24/7', l: 'Live' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-lg md:text-xl font-bold text-amber-400/90">{s.v}</div>
                <div className="text-[10px] text-white/25 mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ FEATURES ═══════ */}
      <section className="relative px-6 py-24">
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px]" style={{ zIndex: 1 }} />

        {/* Gradient mesh transition (replaces thin divider) */}
        <div className="absolute -top-24 inset-x-0 h-48 pointer-events-none" style={{
          background: `
            radial-gradient(ellipse 60% 50% at 50% 100%, rgba(245,158,11,0.03) 0%, transparent 70%),
            radial-gradient(ellipse 40% 40% at 30% 80%, rgba(255,140,50,0.02) 0%, transparent 60%),
            radial-gradient(ellipse 40% 40% at 70% 90%, rgba(200,120,40,0.02) 0%, transparent 60%)
          `,
          zIndex: 2,
        }} />

        {/* Ambient glow spots */}
        <div className="ambient-glow" style={{
          width: '500px', height: '500px',
          top: '20%', left: '-10%',
          background: 'radial-gradient(circle, rgba(245,158,11,0.015), transparent 70%)',
          animationDelay: '0s',
          zIndex: 2,
        }} />
        <div className="ambient-glow" style={{
          width: '400px', height: '400px',
          bottom: '10%', right: '-5%',
          background: 'radial-gradient(circle, rgba(200,100,20,0.01), transparent 70%)',
          animationDelay: '-4s',
          zIndex: 2,
        }} />

        {/* CSS ambient particles */}
        <AmbientParticles count={10} />

        <div className="max-w-4xl mx-auto relative" style={{ zIndex: 10 }}>
          <div className="text-center mb-14">
            <h2
              data-animate="up"
              className="text-2xl md:text-4xl font-bold text-white/90 tracking-tight"
            >
              Everything you need
            </h2>
            <p
              data-animate="up"
              data-animate-delay="1"
              className="mt-3 text-sm text-white/30 max-w-md mx-auto"
            >
              Professional trading tools built for serious market participants
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURES.map((f, i) => (
              <FeatureCard key={i} f={f} i={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section className="relative px-6 py-24">
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px]" style={{ zIndex: 1 }} />

        {/* Gradient mesh transition */}
        <div className="absolute -top-24 inset-x-0 h-48 pointer-events-none" style={{
          background: `
            radial-gradient(ellipse 50% 50% at 50% 100%, rgba(255,255,255,0.015) 0%, transparent 70%),
            radial-gradient(ellipse 35% 40% at 40% 80%, rgba(245,158,11,0.015) 0%, transparent 60%)
          `,
          zIndex: 2,
        }} />

        {/* Ambient glow */}
        <div className="ambient-glow" style={{
          width: '400px', height: '400px',
          top: '30%', left: '50%',
          transform: 'translateX(-50%)',
          background: 'radial-gradient(circle, rgba(245,158,11,0.012), transparent 70%)',
          animationDelay: '-2s',
          zIndex: 2,
        }} />

        <AmbientParticles count={6} />

        <div className="max-w-lg mx-auto text-center relative" style={{ zIndex: 10 }}>
          <h2
            data-animate="up"
            className="text-2xl md:text-3xl font-bold text-white/90 tracking-tight"
          >
            Ready to start?
          </h2>
          <p
            data-animate="up"
            data-animate-delay="1"
            className="mt-4 text-sm text-white/35 leading-relaxed"
          >
            Join <span className="text-amber-400/80">thousands</span> of traders using
            institutional-grade analytics to make better decisions.
          </p>
          <div
            data-animate="up"
            data-animate-delay="2"
            className="mt-8 flex items-center justify-center gap-3 flex-wrap"
          >
            {session ? (
              <Link href="/live" className="landing-btn-primary">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/auth/register" className="landing-btn-primary">
                  Get Started Free
                </Link>
                <Link href="/pricing" className="landing-btn-ghost">
                  Pricing
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="relative px-6 py-8 border-t border-white/[0.04]">
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/85" style={{ zIndex: 1 }} />
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 relative" style={{ zIndex: 10 }}>
          <span className="text-[11px] text-white/15">&copy; 2026 OrderFlow v2</span>
          <div className="flex items-center gap-5">
            {[
              { label: 'Terms', href: '/legal/terms' },
              { label: 'Privacy', href: '/legal/privacy' },
              { label: 'Pricing', href: '/pricing' },
            ].map((l) => (
              <Link key={l.label} href={l.href} className="text-[11px] text-white/15 hover:text-amber-400/70 transition-colors">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
