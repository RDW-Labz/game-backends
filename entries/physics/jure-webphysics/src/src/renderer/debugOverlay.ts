import type { PhysicsStats } from '../physics/types';

export class DebugOverlay {
  private infoDiv: HTMLDivElement;
  private startTimeMs: number;

  constructor() {
    this.startTimeMs = performance.now();

    this.infoDiv = document.createElement('div');
    Object.assign(this.infoDiv.style, {
      position: 'absolute',
      bottom: '10px',
      left: '10px',
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: '12px',
      background: 'rgba(0,0,0,0.7)',
      padding: '8px 12px',
      borderRadius: '4px',
      whiteSpace: 'pre',
      lineHeight: '1.4',
    });
    document.body.appendChild(this.infoDiv);
  }

  begin(): void {
    // No-op: frame timing panel removed.
  }

  end(): void {
    // No-op: frame timing panel removed.
  }

  reset(): void {
    this.startTimeMs = performance.now();
  }

  update(phys: PhysicsStats): void {
    const elapsedSeconds = (performance.now() - this.startTimeMs) / 1000;

    this.infoDiv.textContent = [
      `Bodies:    ${phys.bodyCount}`,
      `Frame:    ${phys.frameCount}`,
      `Elapsed: ${elapsedSeconds.toFixed(1)}s`,
    ].join('\n');
  }
}
