import { useAccountStore } from "../../lib/account/useAccountStore";

function pnlClass(n: number): string {
  if (n > 0) return "acct-table-pos-num";
  if (n < 0) return "acct-table-neg-num";
  return "";
}

export function PositionsTable() {
  const positions = useAccountStore((s) => s.positions);

  return (
    <div className="acct-table-wrap">
      <div className="acct-table-title">Open Positions</div>
      {positions.length === 0 ? (
        <div className="acct-table-empty">No open positions.</div>
      ) : (
        <table className="acct-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th>Qty</th>
              <th>Avg</th>
              <th>Last</th>
              <th>uPnL</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={`${p.symbol}.${p.exchange}`}>
                <td>{p.symbol}</td>
                <td
                  className={
                    p.side === "long" ? "acct-side-buy" :
                    p.side === "short" ? "acct-side-sell" : ""
                  }
                >
                  {p.side.toUpperCase()}
                </td>
                <td>{p.qty}</td>
                <td>{p.avgPrice.toFixed(2)}</td>
                <td>{p.marketPrice.toFixed(2)}</td>
                <td className={pnlClass(p.unrealizedPnl)}>
                  {p.unrealizedPnl >= 0 ? "+" : "-"}$
                  {Math.abs(p.unrealizedPnl).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
