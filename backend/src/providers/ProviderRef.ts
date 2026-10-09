import type {
  GenerateOptions,
  GenerateResult,
  HealthStatus,
  NAtlasProvider,
  StreamChunk,
} from "./NAtlasProvider.js";

/**
 * Mutable wrapper around an NAtlasProvider that can be hot-swapped at runtime.
 */
export class ProviderRef implements NAtlasProvider {
  private _inner: NAtlasProvider;

  constructor(initial: NAtlasProvider) {
    this._inner = initial;
  }

  get name(): string { return this._inner.name; }
  get isMock(): boolean { return this._inner.isMock; }

  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    return this._inner.generate(prompt, options);
  }

  generateStream(
    prompt: string,
    options: GenerateOptions,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    return this._inner.generateStream(prompt, options, onChunk, signal);
  }

  health(): Promise<HealthStatus> {
    return this._inner.health();
  }

  swap(next: NAtlasProvider): void {
    this._inner = next;
  }
}
