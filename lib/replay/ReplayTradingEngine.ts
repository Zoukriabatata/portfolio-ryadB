/**
 * Replay Trading Engine
 *
 * Simulates order execution within replay playback.
 * Orders are filled at the current replay price when conditions are met.
 */

export type ReplayOrderSide = 'buy' | 'sell';
export type ReplayOrderType = 'market' | 'limit' | 'stop';
export type ReplayOrderStatus = 'pending' | 'filled' | 'cancelled';

export interface ReplayOrder {
  id: string;
  side: ReplayOrderSide;
  type: ReplayOrderType;
  quantity: number;
  price?: number;     // Limit or stop price
  fillPrice?: number;
  fillTime?: number;
  status: ReplayOrderStatus;
  createdAt: number;
}

export interface ReplayPosition {
  side: ReplayOrderSide;
  quantity: number;
  entryPrice: number;
  pnl: number;
}

export interface ReplayTradingState {
  orders: ReplayOrder[];
  position: ReplayPosition | null;
  balance: number;
  realizedPnl: number;
  tradeCount: number;
}

export class ReplayTradingEngine {
  private orders: ReplayOrder[] = [];
  private position: ReplayPosition | null = null;
  private balance: number;
  private initialBalance: number;
  private realizedPnl = 0;
  private tradeCount = 0;
  private nextOrderId = 1;

  constructor(initialBalance: number = 100000) {
    this.initialBalance = initialBalance;
    this.balance = initialBalance;
  }

  reset(): void {
    this.orders = [];
    this.position = null;
    this.balance = this.initialBalance;
    this.realizedPnl = 0;
    this.tradeCount = 0;
    this.nextOrderId = 1;
  }

  /**
   * Place a new order. Market orders fill immediately.
   */
  placeOrder(side: ReplayOrderSide, type: ReplayOrderType, quantity: number, currentPrice: number, price?: number): ReplayOrder {
    const order: ReplayOrder = {
      id: `replay_${this.nextOrderId++}`,
      side,
      type,
      quantity,
      price,
      status: 'pending',
      createdAt: Date.now(),
    };

    if (type === 'market') {
      this.fillOrder(order, currentPrice, Date.now());
    } else {
      this.orders.push(order);
    }

    return order;
  }

  /**
   * Called each tick with the current replay price.
   * Checks pending limit/stop orders for fill conditions.
   */
  tick(currentBid: number, currentAsk: number, timestamp: number): void {
    // Update position PnL
    if (this.position) {
      const currentPrice = this.position.side === 'buy' ? currentBid : currentAsk;
      this.position.pnl = this.position.side === 'buy'
        ? (currentPrice - this.position.entryPrice) * this.position.quantity
        : (this.position.entryPrice - currentPrice) * this.position.quantity;
    }

    // Check pending orders
    for (const order of this.orders) {
      if (order.status !== 'pending') continue;

      if (order.type === 'limit') {
        // Buy limit fills when ask <= price, sell limit fills when bid >= price
        if (order.side === 'buy' && currentAsk <= (order.price ?? Infinity)) {
          this.fillOrder(order, currentAsk, timestamp);
        } else if (order.side === 'sell' && currentBid >= (order.price ?? 0)) {
          this.fillOrder(order, currentBid, timestamp);
        }
      } else if (order.type === 'stop') {
        // Buy stop fills when ask >= price, sell stop fills when bid <= price
        if (order.side === 'buy' && currentAsk >= (order.price ?? 0)) {
          this.fillOrder(order, currentAsk, timestamp);
        } else if (order.side === 'sell' && currentBid <= (order.price ?? Infinity)) {
          this.fillOrder(order, currentBid, timestamp);
        }
      }
    }
  }

  private fillOrder(order: ReplayOrder, fillPrice: number, fillTime: number): void {
    order.status = 'filled';
    order.fillPrice = fillPrice;
    order.fillTime = fillTime;
    this.tradeCount++;

    if (!this.position) {
      // Open new position
      this.position = {
        side: order.side,
        quantity: order.quantity,
        entryPrice: fillPrice,
        pnl: 0,
      };
    } else if (this.position.side === order.side) {
      // Add to position (average in)
      const totalQty = this.position.quantity + order.quantity;
      this.position.entryPrice =
        (this.position.entryPrice * this.position.quantity + fillPrice * order.quantity) / totalQty;
      this.position.quantity = totalQty;
    } else {
      // Close/reduce position
      const closeQty = Math.min(this.position.quantity, order.quantity);
      const pnl = this.position.side === 'buy'
        ? (fillPrice - this.position.entryPrice) * closeQty
        : (this.position.entryPrice - fillPrice) * closeQty;

      this.realizedPnl += pnl;
      this.balance += pnl;

      const remaining = this.position.quantity - closeQty;
      if (remaining > 0) {
        this.position.quantity = remaining;
      } else {
        const excess = order.quantity - closeQty;
        if (excess > 0) {
          this.position = {
            side: order.side,
            quantity: excess,
            entryPrice: fillPrice,
            pnl: 0,
          };
        } else {
          this.position = null;
        }
      }
    }
  }

  cancelOrder(orderId: string): boolean {
    const order = this.orders.find(o => o.id === orderId);
    if (order && order.status === 'pending') {
      order.status = 'cancelled';
      return true;
    }
    return false;
  }

  getState(): ReplayTradingState {
    return {
      orders: this.orders,
      position: this.position,
      balance: this.balance,
      realizedPnl: this.realizedPnl,
      tradeCount: this.tradeCount,
    };
  }
}
