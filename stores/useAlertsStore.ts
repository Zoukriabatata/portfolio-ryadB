import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PriceAlert {
  id: string;
  symbol: string;
  price: number;
  direction: 'above' | 'below';
  createdAt: number;
  triggered: boolean;
}

interface AlertNotification {
  id: string;
  alert: PriceAlert;
  timestamp: number;
}

interface AlertsState {
  alerts: PriceAlert[];
  notifications: AlertNotification[];
  addAlert: (symbol: string, price: number, currentPrice: number) => void;
  removeAlert: (id: string) => void;
  checkAlerts: (symbol: string, currentPrice: number) => void;
  dismissNotification: (id: string) => void;
}

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set) => ({
      alerts: [],
      notifications: [],

      addAlert: (symbol, price, currentPrice) => {
        const alert: PriceAlert = {
          id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          symbol,
          price,
          direction: price > currentPrice ? 'above' : 'below',
          createdAt: Date.now(),
          triggered: false,
        };
        set(state => ({ alerts: [...state.alerts, alert] }));
      },

      removeAlert: (id) => {
        set(state => ({ alerts: state.alerts.filter(a => a.id !== id) }));
      },

      checkAlerts: (symbol, currentPrice) => {
        const normalizedSymbol = symbol.toLowerCase();
        set(state => {
          const newNotifications: AlertNotification[] = [];
          const updatedAlerts = state.alerts.map(alert => {
            if (alert.triggered || alert.symbol.toLowerCase() !== normalizedSymbol) return alert;
            const triggered =
              (alert.direction === 'above' && currentPrice >= alert.price) ||
              (alert.direction === 'below' && currentPrice <= alert.price);
            if (triggered) {
              newNotifications.push({
                id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                alert: { ...alert, triggered: true },
                timestamp: Date.now(),
              });
              return { ...alert, triggered: true };
            }
            return alert;
          });
          if (newNotifications.length === 0) return state;
          return {
            alerts: updatedAlerts,
            notifications: [...newNotifications, ...state.notifications].slice(0, 20),
          };
        });
      },

      dismissNotification: (id) => {
        set(state => ({ notifications: state.notifications.filter(n => n.id !== id) }));
      },
    }),
    {
      name: 'senzoukria-alerts',
      skipHydration: true,
      partialize: (state) => ({ alerts: state.alerts }),
    }
  )
);
