"use client";

import { useEffect, useRef } from "react";

type Particle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  hue: number;
};

/** A quiet, pointer-reactive pixel grid for the sign-in background. */
export function PixelField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    const spacing = 15;
    let width = 0;
    let height = 0;
    let frame = 0;
    let pointerX = -1000;
    let pointerY = -1000;
    let targetX = pointerX;
    let targetY = pointerY;
    let influence = 0;
    let targetInfluence = 0;
    let lastFrameAt = 0;
    let particles: Particle[] = [];
    let nextParticleId = 0;
    const hoverPalette = [
      { hue: 215, saturation: 88, lightness: 72 },
      { hue: 28, saturation: 94, lightness: 68 },
      { hue: 2, saturation: 88, lightness: 70 },
    ] as const;

    const seedParticles = () => {
      particles = [];
      nextParticleId = 0;
      for (let y = spacing / 2; y < height; y += spacing) {
        for (let x = spacing / 2; x < width; x += spacing) {
          particles.push({
            id: nextParticleId++,
            x,
            y,
            vx: (Math.random() - 0.5) * 0.42,
            vy: (Math.random() - 0.5) * 0.42,
            phase: Math.random() * Math.PI * 2,
            hue: (Math.floor(x / spacing) * 7 + Math.floor(y / spacing) * 11) % 360,
          });
        }
      }
    };

    const moveAndCollide = (step: number, now: number) => {
      const hoverRadius = 150;

      for (const particle of particles) {
        const dx = particle.x - pointerX;
        const dy = particle.y - pointerY;
        const distance = Math.hypot(dx, dy);
        const hover = Math.max(0, 1 - distance / hoverRadius) * influence;

        if (distance > 0 && hover > 0) {
          particle.vx += (dx / distance) * hover * 0.055 * step;
          particle.vy += (dy / distance) * hover * 0.055 * step;
        }

        particle.vx += Math.sin(now * 0.0007 + particle.phase) * 0.002 * step;
        particle.vy += Math.cos(now * 0.00065 + particle.phase) * 0.002 * step;
        const speed = Math.hypot(particle.vx, particle.vy);
        const maxSpeed = 0.75;
        if (speed > maxSpeed) {
          particle.vx = (particle.vx / speed) * maxSpeed;
          particle.vy = (particle.vy / speed) * maxSpeed;
        }

        particle.x += particle.vx * step;
        particle.y += particle.vy * step;
        if (particle.x < 1 || particle.x > width - 1) particle.vx *= -1;
        if (particle.y < 1 || particle.y > height - 1) particle.vy *= -1;
        particle.x = Math.max(1, Math.min(width - 1, particle.x));
        particle.y = Math.max(1, Math.min(height - 1, particle.y));
      }

      // A small spatial grid keeps collision checks local instead of comparing
      // every dot with every other dot.
      const cellSize = 9;
      const cells = new Map<string, Particle[]>();
      for (const particle of particles) {
        const key = `${Math.floor(particle.x / cellSize)}:${Math.floor(particle.y / cellSize)}`;
        const bucket = cells.get(key);
        if (bucket) bucket.push(particle);
        else cells.set(key, [particle]);
      }

      const collisionDistance = 6.2;
      for (const particle of particles) {
        const cellX = Math.floor(particle.x / cellSize);
        const cellY = Math.floor(particle.y / cellSize);
        for (let y = cellY - 1; y <= cellY + 1; y++) {
          for (let x = cellX - 1; x <= cellX + 1; x++) {
            for (const other of cells.get(`${x}:${y}`) ?? []) {
              if (other.id <= particle.id) continue;
              const dx = other.x - particle.x;
              const dy = other.y - particle.y;
              const distance = Math.hypot(dx, dy);
              if (distance === 0 || distance >= collisionDistance) continue;

              const nx = dx / distance;
              const ny = dy / distance;
              const overlap = (collisionDistance - distance) / 2;
              particle.x -= nx * overlap;
              particle.y -= ny * overlap;
              other.x += nx * overlap;
              other.y += ny * overlap;

              const relativeVelocity = (other.vx - particle.vx) * nx + (other.vy - particle.vy) * ny;
              if (relativeVelocity < 0) {
                particle.vx += relativeVelocity * nx;
                particle.vy += relativeVelocity * ny;
                other.vx -= relativeVelocity * nx;
                other.vy -= relativeVelocity * ny;
              }
            }
          }
        }
      }
    };

    const resize = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedParticles();
      draw();
    };

    const draw = () => {
      const now = performance.now();
      const elapsed = now - lastFrameAt;
      if (elapsed < 1000 / 30) {
        frame = window.requestAnimationFrame(draw);
        return;
      }
      lastFrameAt = now;
      const step = Math.min(elapsed / (1000 / 60), 3);
      context.clearRect(0, 0, width, height);
      const radius = 150;

      if (!reducedMotion.matches) moveAndCollide(step, now);

      for (const particle of particles) {
        const dx = particle.x - pointerX;
        const dy = particle.y - pointerY;
        const distance = Math.hypot(dx, dy);
        const proximity = Math.max(0, 1 - distance / radius) * influence;
        const twinkle = reducedMotion.matches
          ? 0.45
          : (Math.sin(now * 0.005 + particle.phase) + 1) / 2;
        const opacity = 0.2 + twinkle * 0.4 + proximity * 0.32;

        if (proximity > 0.015 && !reducedMotion.matches) {
          const color = hoverPalette[Math.floor((now * 0.0015 + particle.hue / 120) % hoverPalette.length)];
          context.fillStyle = `hsla(${color.hue}, ${color.saturation}%, ${color.lightness}%, ${opacity})`;
        } else {
          context.fillStyle = `rgba(190, 190, 202, ${opacity})`;
        }
        const size = 2.4 + proximity * 0.9;
        context.fillRect(particle.x - size / 2, particle.y - size / 2, size, size);
      }

      pointerX += (targetX - pointerX) * 0.24;
      pointerY += (targetY - pointerY) * 0.24;
      influence += (targetInfluence - influence) * 0.14;

      if (!reducedMotion.matches || Math.abs(influence - targetInfluence) > 0.01) {
        frame = window.requestAnimationFrame(draw);
      } else {
        frame = 0;
      }
    };

    const onMotionPreferenceChange = () => {
      if (!reducedMotion.matches && !frame) {
        frame = window.requestAnimationFrame(draw);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || reducedMotion.matches || coarsePointer.matches) return;
      targetX = event.clientX;
      targetY = event.clientY;
      targetInfluence = 1;
      if (!frame) frame = window.requestAnimationFrame(draw);
    };

    const onPointerLeave = () => {
      targetInfluence = 0;
      if (!frame) frame = window.requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("blur", onPointerLeave);
    reducedMotion.addEventListener("change", onMotionPreferenceChange);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onPointerLeave);
      reducedMotion.removeEventListener("change", onMotionPreferenceChange);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pixel-field"
    />
  );
}
