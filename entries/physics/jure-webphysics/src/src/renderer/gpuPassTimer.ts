import type { WebGPURenderer } from 'three/webgpu';

type TimedEntry = {
  label: string;
  uid: string;
};

export class GpuPassTimer {
  private readonly renderer: WebGPURenderer;
  private enabled = false;
  private readonly supported: boolean;
  private frameEntries: TimedEntry[] = [];
  private readonly maxPendingResolves = 2;
  private pendingResolves = 0;
  private droppedResolveWarned = false;
  private resolveChain: Promise<void> = Promise.resolve();
  private frameIndex = 0;
  private warnedUnavailable = false;
  private sampleEveryNFrames = 30;
  private maxRows = 24;
  private currentFrameId = -1;
  private captureThisFrame = false;

  private originalCompute: ((computeNodes: any, dispatchSize?: any) => any) | null = null;

  constructor(_device: GPUDevice, renderer: WebGPURenderer) {
    this.renderer = renderer;
    this.supported = Boolean((renderer as any)?.hasFeature?.('timestamp-query'));
    this.installRendererHooks();
    this.setBackendTracking(false);
  }

  isSupported(): boolean {
    return this.supported;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    if (enabled && !this.supported) {
      if (!this.warnedUnavailable) {
        console.warn('GPU timing queries are unavailable on this adapter.');
        this.warnedUnavailable = true;
      }
      this.enabled = false;
      this.setBackendTracking(false);
      return;
    }

    this.enabled = enabled;
    this.frameEntries.length = 0;
    this.captureThisFrame = false;
    this.currentFrameId = -1;
    this.setBackendTracking(false);
    console.info(`GPU pass timing ${enabled ? 'enabled' : 'disabled'}.`);
  }

  setSamplingOptions(sampleEveryNFrames: number, maxRows = 24): void {
    this.sampleEveryNFrames = Math.max(1, Math.floor(sampleEveryNFrames));
    this.maxRows = Math.max(1, Math.floor(maxRows));
  }

  beginFrame(): void {
    if (!this.enabled) {
      this.frameEntries.length = 0;
      this.captureThisFrame = false;
      this.currentFrameId = -1;
      this.setBackendTracking(false);
      return;
    }

    const frameId = this.frameIndex++;
    const sampledByCadence = (frameId % this.sampleEveryNFrames) === 0;
    const canResolve = this.pendingResolves < this.maxPendingResolves;

    if (!canResolve && sampledByCadence && !this.droppedResolveWarned) {
      console.warn(
        `GPU pass timing skipped frame ${frameId}: timestamp resolves backlog ` +
        `(${this.pendingResolves}/${this.maxPendingResolves}).`,
      );
      this.droppedResolveWarned = true;
    }

    this.currentFrameId = frameId;
    this.captureThisFrame = sampledByCadence && canResolve;
    this.setBackendTracking(this.captureThisFrame);
    this.frameEntries.length = 0;
  }

  endFrame(): void {
    if (!this.enabled || !this.captureThisFrame || this.frameEntries.length === 0) return;

    const frameId = this.currentFrameId;
    const entries = this.frameEntries.slice();

    this.pendingResolves++;
    this.resolveChain = this.resolveChain
      .then(async () => {
        await (this.renderer as any).resolveTimestampsAsync?.('compute');
        await (this.renderer as any).resolveTimestampsAsync?.('render');
        this.logFrame(frameId, entries);
      })
      .catch((error) => {
        console.warn('GPU timing resolve failed:', error);
      })
      .finally(() => {
        this.pendingResolves = Math.max(0, this.pendingResolves - 1);
        if (this.pendingResolves < this.maxPendingResolves) {
          this.droppedResolveWarned = false;
        }
      });
  }

  dispose(): void {
    this.setEnabled(false);
    this.restoreRendererHooks();
  }

  private installRendererHooks(): void {
    const rendererAny = this.renderer as any;
    if (!rendererAny || typeof rendererAny.compute !== 'function') return;

    if (!this.originalCompute) {
      this.originalCompute = rendererAny.compute.bind(this.renderer);
      rendererAny.compute = (computeNodes: any, dispatchSize?: any) => {
        const result = this.originalCompute!(computeNodes, dispatchSize);
        if (this.enabled && this.captureThisFrame) {
          const uid = this.getTimestampUid(computeNodes);
          if (uid) {
            this.frameEntries.push({
              label: `Compute: ${this.getComputeLabel(computeNodes)}`,
              uid,
            });
          }
        }
        return result;
      };
    }
  }

  private restoreRendererHooks(): void {
    const rendererAny = this.renderer as any;
    if (!rendererAny) return;

    if (this.originalCompute) {
      rendererAny.compute = this.originalCompute;
      this.originalCompute = null;
    }
  }

  private setBackendTracking(enabled: boolean): void {
    const backend = (this.renderer as any)?.backend;
    if (backend) {
      backend.trackTimestamp = enabled;
    }
  }

  private getTimestampUid(computeNodes: any): string | null {
    const backend = (this.renderer as any)?.backend;
    if (!backend?.getTimestampUID) return null;

    try {
      return backend.getTimestampUID(computeNodes) ?? null;
    } catch {
      return null;
    }
  }

  private getComputeLabel(computeNodes: any): string {
    const nodes = Array.isArray(computeNodes) ? computeNodes : [computeNodes];
    const names = nodes
      .map((node) => this.getComputeNodeName(node))
      .filter((name) => name.length > 0);
    return names.length > 0 ? names.join(' + ') : 'Unnamed';
  }

  private getComputeNodeName(node: any): string {
    if (!node) return '';
    if (typeof node.name === 'string' && node.name.length > 0) return node.name;
    if (typeof node.label === 'string' && node.label.length > 0) return node.label;
    if (typeof node.id === 'number') return `Node#${node.id}`;
    return '';
  }

  private logFrame(frameId: number, entries: TimedEntry[]): void {
    const backend = (this.renderer as any)?.backend;
    if (!backend?.hasTimestamp || !backend?.getTimestamp) return;

    const grouped = new Map<string, { count: number; totalMs: number; maxMs: number }>();
    let totalMs = 0;
    let sampledPasses = 0;

    for (const entry of entries) {
      if (!backend.hasTimestamp(entry.uid)) continue;
      const ms = Number(backend.getTimestamp(entry.uid));
      if (!Number.isFinite(ms)) continue;

      sampledPasses++;
      totalMs += ms;

      const current = grouped.get(entry.label);
      if (current) {
        current.count += 1;
        current.totalMs += ms;
        if (ms > current.maxMs) current.maxMs = ms;
      } else {
        grouped.set(entry.label, { count: 1, totalMs: ms, maxMs: ms });
      }
    }

    if (sampledPasses === 0) return;

    const rows = Array.from(grouped.entries())
      .map(([label, value]) => ({
        label,
        count: value.count,
        totalMs: Number(value.totalMs.toFixed(3)),
        avgMs: Number((value.totalMs / value.count).toFixed(3)),
        maxMs: Number(value.maxMs.toFixed(3)),
      }))
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, this.maxRows);

    console.groupCollapsed(
      `[GPU Pass Timing] frame=${frameId} passes=${sampledPasses} labels=${rows.length} total=${totalMs.toFixed(3)}ms`,
    );
    console.table(rows);
    console.groupEnd();
  }
}
