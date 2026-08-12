'use strict';
// Shared sprite FX overlays (tank + dex). Sherpa's lightning: a slow, calm
// blue crackle that arcs across two shell nodes only every few seconds —
// mellow, in keeping with the rest of the art (not the old spastic flicker).

function drawLightningFx(ctx, spots, ox, oy, scale) {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const PERIOD = 3400;  // one gentle crackle per node roughly every 3.4s
  const WINDOW = 300;   // each crackle lasts ~0.3s
  (spots || []).forEach(([sx, sy], i) => {
    const phase = (now + i * 1700) % PERIOD; // stagger the two nodes
    if (phase > WINDOW) return;
    // one soft fade in/out, plus a slow sub-flicker (not frantic)
    const fade = Math.sin((phase / WINDOW) * Math.PI);
    if (Math.floor(now / 110) % 3 === 0 && phase > 110) return;
    const cx = ox + sx * scale, cy = oy + sy * scale;
    ctx.save();
    ctx.globalAlpha = 0.85 * fade;
    ctx.lineWidth = Math.max(1, scale * 0.45);
    ctx.strokeStyle = '#6cb8ff';       // soft blue
    ctx.shadowColor = '#8fd0ff'; ctx.shadowBlur = 4;
    ctx.beginPath();
    let px = cx, py = cy; ctx.moveTo(px, py);
    const segs = 2 + (i % 2);
    for (let k = 0; k < segs; k++) {   // smooth, time-driven jitter (not random)
      px += Math.sin(now * 0.012 + k * 2.1 + i * 3) * 2.1 * scale;
      py -= (1.3 + Math.cos(now * 0.01 + k) * 0.5) * scale;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#cfe8ff';
    ctx.fillRect(cx - scale * 0.4, cy - scale * 0.4, Math.max(1, scale * 0.8), Math.max(1, scale * 0.8));
    ctx.restore();
  });
}
if (typeof window !== 'undefined') window.drawLightningFx = drawLightningFx;
