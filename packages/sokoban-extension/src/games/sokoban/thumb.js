/**
 * Miniature level renderer. Draws a level into an arbitrarily-sized canvas,
 * used for the level-select tiles and the arcade card art — so the picker
 * shows the actual shape of each warehouse instead of a generic box.
 */

import { parseLevel } from './engine.js';

export function drawThumb(canvas, rows, { padding = 6, solved = false } = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const level = parseLevel(rows);
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const css = getComputedStyle(document.documentElement);
  const read = (name) => css.getPropertyValue(name).trim();

  const tile = Math.max(
    2,
    Math.min((width - padding * 2) / level.width, (height - padding * 2) / level.height),
  );
  const offsetX = (width - tile * level.width) / 2;
  const offsetY = (height - tile * level.height) / 2;

  const colors = {
    floor: read('--floor'),
    floorAlt: read('--floor-alt'),
    wall: read('--wall'),
    goal: read('--goal'),
    crate: solved ? read('--crate-done') : read('--crate'),
    player: read('--player'),
  };

  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const index = y * level.width + x;
      const px = offsetX + x * tile;
      const py = offsetY + y * tile;

      if (level.walls.has(index)) {
        ctx.fillStyle = colors.wall;
        ctx.fillRect(px, py, tile - 0.5, tile - 0.5);
        continue;
      }

      ctx.fillStyle = (x + y) % 2 ? colors.floorAlt : colors.floor;
      ctx.fillRect(px, py, tile, tile);

      if (level.goals.has(index)) {
        ctx.fillStyle = colors.goal;
        ctx.beginPath();
        ctx.arc(px + tile / 2, py + tile / 2, tile * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  for (const box of level.boxes) {
    const x = offsetX + (box % level.width) * tile;
    const y = offsetY + Math.floor(box / level.width) * tile;
    ctx.fillStyle = colors.crate;
    roundRect(ctx, x + tile * 0.14, y + tile * 0.14, tile * 0.72, tile * 0.72, tile * 0.18);
    ctx.fill();
  }

  const px = offsetX + (level.player % level.width) * tile;
  const py = offsetY + Math.floor(level.player / level.width) * tile;
  ctx.fillStyle = colors.player;
  ctx.beginPath();
  ctx.arc(px + tile / 2, py + tile / 2, tile * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
