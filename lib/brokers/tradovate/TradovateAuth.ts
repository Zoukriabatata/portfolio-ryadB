/**
 * Tradovate Authentication Client
 *
 * Handles access token request, renewal, and OAuth2 flows.
 * Supports both demo and live environments.
 */

export interface TradovateCredentials {
  name: string;
  password: string;
  appId?: string;
  appVersion?: string;
  cid?: number;
  sec?: string;
  deviceId?: string;
}

export interface TradovateTokenResponse {
  accessToken: string;
  expirationTime: string;
  userId: number;
  userStatus: string;
  name: string;
  passwordExpirationTime?: string;
}

export type TradovateEnv = 'demo' | 'live';

const BASE_URLS: Record<TradovateEnv, string> = {
  demo: 'https://demo.tradovateapi.com/v1',
  live: 'https://live-api-d.tradovate.com/v1',
};

const WS_URLS: Record<TradovateEnv, string> = {
  demo: 'wss://demo.tradovateapi.com/v1/websocket',
  live: 'wss://live.tradovateapi.com/v1/websocket',
};

const MD_WS_URLS: Record<TradovateEnv, string> = {
  demo: 'wss://md-d.tradovateapi.com/v1/websocket',
  live: 'wss://md.tradovateapi.com/v1/websocket',
};

export class TradovateAuth {
  private accessToken: string | null = null;
  private expiresAt: number = 0;
  private renewTimer: ReturnType<typeof setTimeout> | null = null;
  private env: TradovateEnv;

  constructor(env: TradovateEnv = 'demo') {
    this.env = env;
  }

  get baseUrl(): string {
    return BASE_URLS[this.env];
  }

  get wsUrl(): string {
    return WS_URLS[this.env];
  }

  get mdWsUrl(): string {
    return MD_WS_URLS[this.env];
  }

  get token(): string | null {
    return this.accessToken;
  }

  get isAuthenticated(): boolean {
    return !!this.accessToken && Date.now() < this.expiresAt;
  }

  async authenticate(credentials: TradovateCredentials): Promise<TradovateTokenResponse> {
    const response = await fetch(`${this.baseUrl}/auth/accesstokenrequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: credentials.name,
        password: credentials.password,
        appId: credentials.appId || 'SenzoukriaTrading',
        appVersion: credentials.appVersion || '1.0.0',
        cid: credentials.cid,
        sec: credentials.sec,
        deviceId: credentials.deviceId || this.generateDeviceId(),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Authentication failed: ${error}`);
    }

    const data: TradovateTokenResponse = await response.json();

    if (!data.accessToken) {
      throw new Error('No access token received');
    }

    this.accessToken = data.accessToken;
    this.expiresAt = new Date(data.expirationTime).getTime();

    // Schedule token renewal 15 minutes before expiry
    this.scheduleRenewal();

    return data;
  }

  async renewToken(): Promise<void> {
    if (!this.accessToken) {
      throw new Error('No token to renew');
    }

    const response = await fetch(`${this.baseUrl}/auth/renewaccesstoken`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      this.accessToken = null;
      this.expiresAt = 0;
      throw new Error('Token renewal failed');
    }

    const data = await response.json();
    if (data.accessToken) {
      this.accessToken = data.accessToken;
      this.expiresAt = new Date(data.expirationTime).getTime();
      this.scheduleRenewal();
    }
  }

  getAuthHeaders(): Record<string, string> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  disconnect(): void {
    this.accessToken = null;
    this.expiresAt = 0;
    if (this.renewTimer) {
      clearTimeout(this.renewTimer);
      this.renewTimer = null;
    }
  }

  private scheduleRenewal(): void {
    if (this.renewTimer) {
      clearTimeout(this.renewTimer);
    }
    // Renew 15 minutes before expiry
    const renewIn = Math.max(0, this.expiresAt - Date.now() - 15 * 60 * 1000);
    this.renewTimer = setTimeout(() => {
      this.renewToken().catch(console.error);
    }, renewIn);
  }

  private generateDeviceId(): string {
    if (typeof window !== 'undefined') {
      let id = localStorage.getItem('senzoukria-device-id');
      if (!id) {
        id = `sen_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem('senzoukria-device-id', id);
      }
      return id;
    }
    return `sen_server_${Date.now()}`;
  }
}
