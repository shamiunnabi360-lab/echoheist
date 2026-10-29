import { TILE_SIZE } from '../config';
import { activeLaserTiles, guardSightTiles } from '../sim/hazards';
import { TILE, computeOpenDoors, gridSize, keyOf, tileAt } from '../sim/level';
import type { EntityState, GameState, LevelDef } from '../sim/types';

/** The only eight colors the game draws with. */
export const PALETTE = {
  ink: '#0f1020',
  dusk: '#1c2436',
  iron: '#303b52',
  steel: '#55637d',
  bone: '#e6e2d3',
  gold: '#f2b94b',
  blood: '#e0455a',
  aqua: '#3fc7b4',
} as const;

/** Run 1 = aqua, run 2 = gold, run 3 = steel, run 4 = bone, run 5 = blood. */
const GHOST_COLORS = [PALETTE.aqua, PALETTE.gold, PALETTE.steel, PALETTE.bone, PALETTE.blood];

export function ghostColor(ghostIndex: number): string {
  return GHOST_COLORS[ghostIndex % GHOST_COLORS.length];
}

/** Pixel art gains nothing from 3x+ backing stores; cap fill-rate on high-DPI phones. */
const MAX_CANVAS_DPR = 2;

/**
 * Pixel-art canvas renderer.
 *
 * The board is drawn onto a low-resolution offscreen canvas (16px per tile),
 * then blitted to the display canvas with a whole-number scale and smoothing
 * disabled. Every sprite therefore stays on the pixel grid at any window size,
 * and the 8-color palette reads cleanly.
 */
export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private board: HTMLCanvasElement | null = null;
  private boardCtx: CanvasRenderingContext2D | null = null;
  // State snapshots are immutable, so an unchanged reference means an unchanged frame.
  private lastState: GameState | null = null;
  private lastLevel: LevelDef | null = null;
  private lastWidth = 0;
  private lastHeight = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is not available');
    this.canvas = canvas;
    this.ctx = ctx;
  }

  draw(state: GameState, level: LevelDef): void {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR);
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    const pxW = Math.round(rect.width * dpr);
    const pxH = Math.round(rect.height * dpr);
    if (
      this.lastState === state &&
      this.lastLevel === level &&
      this.lastWidth === pxW &&
      this.lastHeight === pxH
    ) {
      return;
    }
    this.lastState = state;
    this.lastLevel = level;
    this.lastWidth = pxW;
    this.lastHeight = pxH;

    if (this.canvas.width !== pxW || this.canvas.height !== pxH) {
      this.canvas.width = pxW;
      this.canvas.height = pxH;
    }

    const { cols, rows } = gridSize(level);
    const boardW = cols * TILE_SIZE;
    const boardH = rows * TILE_SIZE;
    this.ensureBoard(boardW, boardH);
    this.drawBoard(state, level, boardW, boardH);

    if (!this.board) return;

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(0, 0, pxW, pxH);

    const scale = Math.max(1, Math.floor(Math.min(pxW / boardW, pxH / boardH)));
    const x0 = Math.floor((pxW - boardW * scale) / 2);
    const y0 = Math.floor((pxH - boardH * scale) / 2);
    const frame = Math.max(2, Math.round(2 * dpr));

    ctx.fillStyle = PALETTE.steel;
    ctx.fillRect(x0 - frame, y0 - frame, boardW * scale + frame * 2, boardH * scale + frame * 2);
    ctx.drawImage(this.board, x0, y0, boardW * scale, boardH * scale);
  }

  private ensureBoard(width: number, height: number): void {
    if (!this.board) {
      const board = document.createElement('canvas');
      const ctx = board.getContext('2d');
      if (!ctx) return;
      this.board = board;
      this.boardCtx = ctx;
    }
    if (this.board.width !== width || this.board.height !== height) {
      this.board.width = width;
      this.board.height = height;
    }
  }

  private drawBoard(state: GameState, level: LevelDef, width: number, height: number): void {
    const ctx = this.boardCtx;
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);

    const openDoors = computeOpenDoors(state.entities, level);
    this.drawTiles(ctx, state, level, openDoors);
    this.drawSight(ctx, state, level, openDoors);
    this.drawLasers(ctx, state, level);
    this.drawEntities(ctx, state);
    this.drawGuards(ctx, state);
  }

  private drawTiles(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    level: LevelDef,
    openDoors: Set<string>,
  ): void {
    const { cols, rows } = gridSize(level);

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const tile = tileAt(level, x, y);

        if (tile === TILE.WALL) {
          this.drawWall(ctx, px, py);
          continue;
        }

        ctx.fillStyle = (x + y) % 2 === 0 ? PALETTE.ink : PALETTE.dusk;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        switch (tile) {
          case TILE.PLATE: {
            const active = state.entities.some((e) => e.pos.x === x && e.pos.y === y);
            this.drawPlate(ctx, px, py, active);
            break;
          }
          case TILE.KEYCARD:
            this.drawKeycard(ctx, px, py);
            break;
          case TILE.DIAMOND:
            this.drawDiamond(ctx, px, py);
            break;
          case TILE.EXIT:
            this.drawExit(ctx, px, py);
            break;
          case TILE.DOOR:
            this.drawDoor(ctx, px, py, openDoors.has(keyOf(x, y)));
            break;
          case TILE.LOCKED_DOOR:
            this.drawLockedDoor(ctx, px, py);
            break;
          default:
            break;
        }
      }
    }
  }

  private drawWall(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    const t = TILE_SIZE;
    ctx.fillStyle = PALETTE.iron;
    ctx.fillRect(px, py, t, t);
    ctx.fillStyle = PALETTE.steel;
    ctx.fillRect(px, py, t, 2);
    ctx.fillRect(px, py, 2, t);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(px + t - 2, py + 2, 2, t - 2);
    ctx.fillRect(px + 2, py + t - 2, t - 2, 2);
  }

  private drawSight(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    level: LevelDef,
    openDoors: Set<string>,
  ): void {
    for (const guard of state.guards) {
      for (const tile of guardSightTiles(level, guard, openDoors)) {
        const px = tile.x * TILE_SIZE;
        const py = tile.y * TILE_SIZE;
        ctx.fillStyle = 'rgba(224, 69, 90, 0.10)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = 'rgba(224, 69, 90, 0.30)';
        for (let dy = 2; dy < TILE_SIZE; dy += 4) {
          for (let dx = 2; dx < TILE_SIZE; dx += 4) {
            ctx.fillRect(px + dx, py + dy, 1, 1);
          }
        }
      }
    }
  }

  private drawLasers(ctx: CanvasRenderingContext2D, state: GameState, level: LevelDef): void {
    const active = activeLaserTiles(level, state.entities, state.tick);
    const t = TILE_SIZE;

    for (const laser of level.lasers ?? []) {
      const first = laser.tiles[0];
      const last = laser.tiles[laser.tiles.length - 1];
      const on = active.has(keyOf(first[0], first[1]));
      const vertical = first[0] === last[0];

      const xs = laser.tiles.map(([x]) => x);
      const ys = laser.tiles.map(([, y]) => y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      if (vertical) {
        const x = minX * t + t / 2;
        if (on) {
          ctx.fillStyle = PALETTE.blood;
          ctx.fillRect(x - 2, minY * t, 4, (maxY - minY + 1) * t);
          ctx.fillStyle = PALETTE.bone;
          ctx.fillRect(x - 1, minY * t, 2, (maxY - minY + 1) * t);
        } else {
          ctx.fillStyle = PALETTE.steel;
          for (let y = minY; y <= maxY; y += 1) {
            ctx.fillRect(x - 1, y * t + 5, 2, 6);
          }
        }
        this.drawEmitter(ctx, x - 3, minY * t, on);
        this.drawEmitter(ctx, x - 3, (maxY + 1) * t - 6, on);
      } else {
        const y = minY * t + t / 2;
        if (on) {
          ctx.fillStyle = PALETTE.blood;
          ctx.fillRect(minX * t, y - 2, (maxX - minX + 1) * t, 4);
          ctx.fillStyle = PALETTE.bone;
          ctx.fillRect(minX * t, y - 1, (maxX - minX + 1) * t, 2);
        } else {
          ctx.fillStyle = PALETTE.steel;
          for (let x = minX; x <= maxX; x += 1) {
            ctx.fillRect(x * t + 5, y - 1, 6, 2);
          }
        }
        this.drawEmitter(ctx, minX * t, y - 3, on);
        this.drawEmitter(ctx, (maxX + 1) * t - 6, y - 3, on);
      }
    }
  }

  private drawEmitter(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    on: boolean,
  ): void {
    ctx.fillStyle = on ? PALETTE.blood : PALETTE.steel;
    ctx.fillRect(x, y, 6, 6);
    ctx.fillStyle = on ? PALETTE.bone : PALETTE.ink;
    ctx.fillRect(x + 2, y + 2, 2, 2);
  }

  private drawGuards(ctx: CanvasRenderingContext2D, state: GameState): void {
    for (const guard of state.guards) {
      const px = guard.pos.x * TILE_SIZE;
      const py = guard.pos.y * TILE_SIZE;
      const fx = guard.facing.x;
      const fy = guard.facing.y;

      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(px + 3, py + 13, 10, 2);

      ctx.fillStyle = PALETTE.blood;
      ctx.fillRect(px + 4, py + 6, 8, 7);
      ctx.fillRect(px + 5, py + 3, 6, 4);

      ctx.fillStyle = PALETTE.steel;
      ctx.fillRect(px + 5, py + 3, 6, 2);
      ctx.fillRect(px + 4, py + 13, 3, 1);
      ctx.fillRect(px + 9, py + 13, 3, 1);

      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(px + 6, py + 5, 4, 1);

      ctx.fillStyle = PALETTE.bone;
      ctx.fillRect(px + 7 + fx, py + 5 + fy, 2, 2);
    }
  }

  private drawEntities(ctx: CanvasRenderingContext2D, state: GameState): void {
    for (let i = state.entities.length - 1; i >= 1; i -= 1) {
      this.drawActor(ctx, state.entities[i], ghostColor(i - 1), PALETTE.ink, 0.5);
    }
    this.drawActor(ctx, state.entities[0], PALETTE.bone, PALETTE.aqua, 1);
  }

  private drawActor(
    ctx: CanvasRenderingContext2D,
    entity: EntityState,
    body: string,
    accent: string,
    alpha: number,
  ): void {
    const px = entity.pos.x * TILE_SIZE;
    const py = entity.pos.y * TILE_SIZE;
    const fx = entity.facing.x;
    const fy = entity.facing.y;

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(px + 4, py + 13, 8, 2);

    ctx.fillStyle = body;
    ctx.fillRect(px + 4, py + 5, 8, 8);
    ctx.fillRect(px + 5, py + 3, 6, 2);
    ctx.fillRect(px + 3, py + 8, 1, 2);
    ctx.fillRect(px + 12, py + 8, 1, 2);

    ctx.fillStyle = accent;
    ctx.fillRect(px + 6 + fx, py + 6 + fy, 2, 2);
    ctx.fillRect(px + 9 + fx, py + 6 + fy, 1, 1);

    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(px + 4, py + 13, 3, 1);
    ctx.fillRect(px + 9, py + 13, 3, 1);

    ctx.restore();
  }

  private drawPlate(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    active: boolean,
  ): void {
    ctx.fillStyle = active ? PALETTE.gold : PALETTE.steel;
    ctx.fillRect(px + 3, py + 3, 10, 10);
    ctx.fillStyle = PALETTE.dusk;
    ctx.fillRect(px + 5, py + 5, 6, 6);
    if (active) {
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(px + 7, py + 7, 2, 2);
      ctx.fillRect(px + 5, py + 3, 1, 1);
      ctx.fillRect(px + 10, py + 3, 1, 1);
    }
  }

  private drawKeycard(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(px + 4, py + 5, 8, 6);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(px + 4, py + 8, 8, 1);
    ctx.fillStyle = PALETTE.bone;
    ctx.fillRect(px + 9, py + 6, 2, 2);
  }

  private drawDiamond(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    ctx.fillStyle = PALETTE.aqua;
    ctx.fillRect(px + 7, py + 3, 2, 2);
    ctx.fillRect(px + 5, py + 5, 6, 2);
    ctx.fillRect(px + 3, py + 7, 10, 2);
    ctx.fillRect(px + 5, py + 9, 6, 2);
    ctx.fillRect(px + 7, py + 11, 2, 2);
    ctx.fillStyle = PALETTE.bone;
    ctx.fillRect(px + 6, py + 6, 2, 2);
  }

  private drawExit(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    ctx.fillStyle = PALETTE.aqua;
    ctx.fillRect(px + 2, py + 2, 12, 1);
    ctx.fillRect(px + 2, py + 13, 12, 1);
    ctx.fillRect(px + 2, py + 2, 1, 12);
    ctx.fillRect(px + 13, py + 2, 1, 12);
    ctx.fillStyle = PALETTE.dusk;
    ctx.fillRect(px + 4, py + 4, 8, 8);
    ctx.fillStyle = PALETTE.aqua;
    ctx.fillRect(px + 7, py + 6, 2, 4);
    ctx.fillRect(px + 6, py + 7, 1, 1);
    ctx.fillRect(px + 9, py + 7, 1, 1);
  }

  private drawDoor(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    open: boolean,
  ): void {
    if (open) {
      ctx.fillStyle = PALETTE.steel;
      ctx.fillRect(px + 2, py + 2, 2, 12);
      ctx.fillRect(px + 12, py + 2, 2, 12);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(px + 4, py + 2, 8, 1);
      ctx.fillRect(px + 4, py + 13, 8, 1);
      return;
    }

    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(px + 2, py + 2, 12, 12);
    ctx.fillStyle = PALETTE.dusk;
    ctx.fillRect(px + 4, py + 4, 8, 8);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(px + 7, py + 7, 2, 2);
  }

  private drawLockedDoor(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    ctx.fillStyle = PALETTE.steel;
    ctx.fillRect(px + 2, py + 2, 12, 12);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(px + 4, py + 4, 8, 8);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(px + 7, py + 6, 2, 3);
    ctx.fillRect(px + 6, py + 9, 4, 2);
  }
}
