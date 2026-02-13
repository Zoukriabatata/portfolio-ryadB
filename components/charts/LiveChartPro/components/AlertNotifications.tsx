interface AlertNotification {
  id: string;
  alert: {
    symbol: string;
    price: number;
    direction: 'above' | 'below';
  };
}

interface AlertNotificationsProps {
  notifications: AlertNotification[];
  onDismiss: (id: string) => void;
  theme: {
    colors: {
      textMuted: string;
    };
  };
}

export default function AlertNotifications({ notifications, onDismiss, theme }: AlertNotificationsProps) {
  if (notifications.length === 0) return null;

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5" style={{ maxWidth: 260 }}>
      {notifications.slice(0, 3).map(notif => (
        <div
          key={notif.id}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
          style={{
            backgroundColor: 'rgba(234, 179, 8, 0.12)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            backdropFilter: 'blur(8px)',
            animation: 'alertIn 0.3s ease-out',
          }}
        >
          <span style={{ fontSize: 14 }}>🔔</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-yellow-400 truncate">
              {notif.alert.symbol.toUpperCase()} @ ${notif.alert.price.toFixed(2)}
            </div>
            <div style={{ color: theme.colors.textMuted, fontSize: 10 }}>
              Price {notif.alert.direction === 'above' ? 'crossed above' : 'dropped below'} alert
            </div>
          </div>
          <button
            onClick={() => onDismiss(notif.id)}
            className="w-4 h-4 flex items-center justify-center rounded hover:bg-white/10"
            style={{ color: theme.colors.textMuted }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
