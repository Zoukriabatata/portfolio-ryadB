/**
 * Tradovate REST API Client
 *
 * Handles orders, positions, accounts, and contracts.
 * Requires TradovateAuth for authentication.
 */

import { TradovateAuth } from './TradovateAuth';

// ─── Types ──────────────────────────────────────────────

export interface TradovateAccount {
  id: number;
  name: string;
  userId: number;
  accountType: string;
  active: boolean;
  clearingHouseId: number;
  riskCategoryId: number;
  autoLiqProfileId: number;
  marginAccountType: string;
  legalStatus: string;
}

export interface TradovateCashBalance {
  id: number;
  accountId: number;
  timestamp: string;
  tradeDate: { year: number; month: number; day: number };
  currencyId: number;
  amount: number;
  realizedPnL: number;
  weekRealizedPnL: number;
}

export interface TradovatePosition {
  id: number;
  accountId: number;
  contractId: number;
  timestamp: string;
  tradeDate: { year: number; month: number; day: number };
  netPos: number;
  netPrice: number;
  bought: number;
  boughtValue: number;
  sold: number;
  soldValue: number;
  prevPos: number;
  prevPrice: number;
}

export interface TradovateContract {
  id: number;
  name: string;
  contractMaturityId: number;
  status: string;
  providerTickSize: number;
  contractGroupId: number;
}

export interface TradovateOrderResult {
  orderId?: number;
  errorText?: string;
  errorCode?: number;
}

export interface TradovatePlaceOrderParams {
  accountSpec: string;
  accountId: number;
  action: 'Buy' | 'Sell';
  symbol: string;
  orderQty: number;
  orderType: 'Market' | 'Limit' | 'Stop' | 'StopLimit';
  price?: number;
  stopPrice?: number;
  timeInForce?: 'Day' | 'GTC' | 'IOC' | 'FOK';
  isAutomated?: boolean;
}

// ─── Client ─────────────────────────────────────────────

export class TradovateClient {
  private auth: TradovateAuth;

  constructor(auth: TradovateAuth) {
    this.auth = auth;
  }

  // ─── Accounts ───

  async getAccounts(): Promise<TradovateAccount[]> {
    return this.get<TradovateAccount[]>('/account/list');
  }

  async getAccount(id: number): Promise<TradovateAccount> {
    return this.get<TradovateAccount>(`/account/item?id=${id}`);
  }

  async getCashBalances(): Promise<TradovateCashBalance[]> {
    return this.get<TradovateCashBalance[]>('/cashBalance/list');
  }

  // ─── Positions ───

  async getPositions(): Promise<TradovatePosition[]> {
    return this.get<TradovatePosition[]>('/position/list');
  }

  async getPosition(id: number): Promise<TradovatePosition> {
    return this.get<TradovatePosition>(`/position/item?id=${id}`);
  }

  // ─── Orders ───

  async placeOrder(params: TradovatePlaceOrderParams): Promise<TradovateOrderResult> {
    return this.post<TradovateOrderResult>('/order/placeorder', params);
  }

  async cancelOrder(orderId: number): Promise<TradovateOrderResult> {
    return this.post<TradovateOrderResult>('/order/cancelorder', { orderId });
  }

  async modifyOrder(orderId: number, qty?: number, price?: number, stopPrice?: number): Promise<TradovateOrderResult> {
    const body: Record<string, unknown> = { orderId };
    if (qty !== undefined) body.orderQty = qty;
    if (price !== undefined) body.price = price;
    if (stopPrice !== undefined) body.stopPrice = stopPrice;
    return this.post<TradovateOrderResult>('/order/modifyorder', body);
  }

  // ─── Contracts ───

  async findContract(name: string): Promise<TradovateContract> {
    return this.get<TradovateContract>(`/contract/find?name=${encodeURIComponent(name)}`);
  }

  async suggestContracts(text: string, nEntities: number = 10): Promise<TradovateContract[]> {
    return this.get<TradovateContract[]>(`/contract/suggest?t=${encodeURIComponent(text)}&l=${nEntities}`);
  }

  // ─── User Info ───

  async getMe(): Promise<{ userId: number; name: string }> {
    return this.get('/auth/me');
  }

  // ─── Internal ───

  private async get<T>(path: string): Promise<T> {
    if (!this.auth.isAuthenticated) {
      throw new Error('Not authenticated with Tradovate');
    }

    const response = await fetch(`${this.auth.baseUrl}${path}`, {
      method: 'GET',
      headers: this.auth.getAuthHeaders(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tradovate API error (${response.status}): ${text}`);
    }

    return response.json();
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.auth.isAuthenticated) {
      throw new Error('Not authenticated with Tradovate');
    }

    const response = await fetch(`${this.auth.baseUrl}${path}`, {
      method: 'POST',
      headers: this.auth.getAuthHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tradovate API error (${response.status}): ${text}`);
    }

    return response.json();
  }
}
