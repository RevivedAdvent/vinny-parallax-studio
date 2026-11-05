import { Sprite, Texture } from 'pixi.js';
import type { LayerMask } from '../camera/layer-effects.ts';

const SIZE = 128;
/** Shared textures: generated once per page, never per rendered frame. */
let linear: Texture | undefined;
const radial = new Map<number, Texture>();

function texture(draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Mask rendering requires a 2D canvas context');
  draw(ctx);
  return Texture.from(canvas);
}

/** White to black left-to-right. Sampling outside the sprite clamps to its edge,
 * so one thin band acts as a full-frame wipe with a feathered boundary. */
function linearTexture(): Texture {
  linear ??= texture(ctx => {
    const gradient = ctx.createLinearGradient(0, 0, SIZE, 0);
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(1, '#000000');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, SIZE, SIZE);
  });
  return linear;
}

/** White disc fading to black over its outer `softness` fraction. Cached per 1% bucket. */
function radialTexture(softness: number): Texture {
  const feather = Math.min(.6, Math.max(.005, softness * .5));
  const bucket = Math.round(feather * 100);
  const cached = radial.get(bucket);
  if (cached) return cached;
  const value = texture(ctx => {
    const centre = SIZE / 2;
    const gradient = ctx.createRadialGradient(centre, centre, 0, centre, centre, centre);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(Math.max(0, 1 - bucket / 100), '#ffffff');
    gradient.addColorStop(1, '#000000');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, SIZE, SIZE);
  });
  radial.set(bucket, value);
  return value;
}

/**
 * A mask sprite lives inside the rendered world so Pixi keeps its transform
 * current, but `renderable` stays false: it is only ever sampled as an alpha
 * mask. One sprite per layer is reused; only its transform and texture change.
 */
export class LayerMaskView {
  readonly sprite: Sprite;

  constructor() {
    this.sprite = new Sprite(linearTexture());
    this.sprite.anchor.set(0, 0);
    this.sprite.renderable = false;
    this.sprite.visible = false;
    this.sprite.eventMode = 'none';
  }

  update(mask: LayerMask, width: number, height: number): void {
    const coverage = Math.max(0, Math.min(1, mask.coverage));
    const softness = Math.max(0, Math.min(1, mask.softness));
    this.sprite.visible = true;
    if (mask.kind === 'wipe') {
      const feather = Math.max(.5, softness * .08 * Math.min(width, height));
      const boundary = -width / 2 - feather + coverage * (width + 2 * feather);
      const start = boundary - feather;
      // Rotate the band about the frame centre so the same gradient serves every side.
      const angle = mask.direction === 'left' ? 0 : mask.direction === 'right' ? Math.PI : mask.direction === 'top' ? Math.PI / 2 : -Math.PI / 2;
      const cx = width / 2, cy = height / 2;
      const dx = start - cx, dy = -cy;
      this.sprite.texture = linearTexture();
      this.sprite.position.set(cx + dx * Math.cos(angle) - dy * Math.sin(angle), cy + dx * Math.sin(angle) + dy * Math.cos(angle));
      this.sprite.rotation = angle;
      this.sprite.scale.set(feather / SIZE, height / SIZE);
    } else {
      const originX = mask.originX * width, originY = mask.originY * height;
      const radius = Math.max(.5, coverage * Math.max(
        Math.hypot(originX, originY), Math.hypot(width - originX, originY),
        Math.hypot(originX, height - originY), Math.hypot(width - originX, height - originY)));
      this.sprite.texture = radialTexture(softness);
      this.sprite.anchor.set(.5);
      this.sprite.position.set(originX, originY);
      this.sprite.rotation = 0;
      this.sprite.scale.set(2 * radius / SIZE, 2 * radius / SIZE);
    }
    this.sprite.updateLocalTransform();
  }

  hide(): void { this.sprite.visible = false; }

  destroy(): void { this.sprite.destroy(); }
}
