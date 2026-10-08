import type {
  GenerateOptions,
  GenerateResult,
  HealthStatus,
  NAtlasProvider,
} from "./NAtlasProvider.js";

/**
 * Mutable wrapper around an NAtlasProvider that can be hot-swapped at runtime.
 * All routes hold a reference to the same ProviderRef, so swapping the inner
 * provider immediately affects all subsequent requests without a server restart.
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

  health(): Promise<HealthStatus> {
    return this._inner.health();
  }

  swap(next: NAtlasProvider): void {
    this._inner = next;
  }
}
