// Horloge exchange-only. Single source of truth pour le temps de rendu.
// Aucune horloge wall-clock ni monotonic locale ici (cf. ANTI-PATTERNS du
// brief refonte). Le temps vient exclusivement des messages venue.
// Out-of-order toléré : ticks <= now sont ignorés silencieusement.
export class ClockSource {
  private _nowExchangeMs = 0;

  tick(exchangeMs: number): void {
    if (exchangeMs > this._nowExchangeMs) {
      this._nowExchangeMs = exchangeMs;
    }
  }

  now(): number {
    return this._nowExchangeMs;
  }

  hasReceived(): boolean {
    return this._nowExchangeMs > 0;
  }
}
