import { useAccountStore } from "../../lib/account/useAccountStore";

function fmtPrice(n: number | null): string {
  return n === null || !Number.isFinite(n) ? "—" : n.toFixed(2);
}

export function WorkingOrdersTable() {
  const orders = useAccountStore((s) => s.workingOrders);

  return (
    <div className="acct-table-wrap">
      <div className="acct-table-title">
        <span>Working Orders</span>
      </div>
      {orders.length === 0 ? (
        <div className="acct-table-empty">No pending orders right now.</div>
      ) : (
        <table className="acct-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th>Type</th>
              <th>Qty</th>
              <th>Limit</th>
              <th>Stop</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.orderId}>
                <td>{o.symbol}</td>
                <td className={o.side === "buy" ? "acct-side-buy" : "acct-side-sell"}>
                  {o.side.toUpperCase()}
                </td>
                <td>{o.orderType.replace("_", " ").toUpperCase()}</td>
                <td>
                  {o.qty}
                  {o.filledQty > 0 && ` (${o.filledQty})`}
                </td>
                <td>{fmtPrice(o.limitPrice)}</td>
                <td>{fmtPrice(o.stopPrice)}</td>
                <td>{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
