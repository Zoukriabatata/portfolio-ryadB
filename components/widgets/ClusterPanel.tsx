'use client';

import { useEffect, useState, useRef } from 'react';
import { useMarketStore } from '@/stores/useMarketStore';
import { bybitWS } from '@/lib/websocket/BybitWS';
import { buildClusters, type ClusterLevel } from '@/lib/calculations/indicators';
import { SYMBOLS, type Trade } from '@/types/market';

interface ClusterPanelProps {
  maxLevels?: number;
}

export default function ClusterPanel({ maxLevels = 15 }: ClusterPanelProps) {
  const symbol = useMarketStore((s) => s.symbol);
  const currentPrice = useMarketStore((s) => s.currentPrice);
  const [clusters, setClusters] = useState<ClusterLevel[]>([]);
  const [totals, setTotals] = useState({ bid: 0, ask: 0, delta: 0 });
  const tradesRef = useRef<Trade[]>([]);

  const symbolInfo = SYMBOLS[symbol];
  const isCME = symbolInfo?.exchange === 'tradovate';
  const tickSize = symbolInfo?.tickSize || 1;

  useEffect(() => {
    if (isCME) return; // No real-time trades for CME

    tradesRef.current = [];
    setClusters([]);
    setTotals({ bid: 0, ask: 0, delta: 0 });

    bybitWS.connect('linear');

    const handleTrade = (trade: Trade) => {
      tradesRef.current.push(trade);

      // Keep last 1000 trades
      if (tradesRef.current.length > 1000) {
        tradesRef.current = tradesRef.current.slice(-1000);
      }

      // Rebuild clusters
      const clusterMap = buildClusters(tradesRef.current, tickSize);
      const clusterArray = Array.from(clusterMap.values())
        .sort((a, b) => b.price - a.price);

      // Calculate totals
      let totalBid = 0;
      let totalAsk = 0;
      clusterArray.forEach(c => {
        totalBid += c.bid;
        totalAsk += c.ask;
      });

      setClusters(clusterArray);
      setTotals({
        bid: totalBid,
        ask: totalAsk,
        delta: totalAsk - totalBid,
      });
    };

    const unsubscribe = bybitWS.subscribeTrades(symbol, handleTrade, 'linear');

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [symbol, isCME, tickSize]);

  // Filter clusters around current price
  const visibleClusters = clusters
    .filter(c => {
      if (!currentPrice) return true;
      const distance = Math.abs(c.price - currentPrice);
      const maxDistance = tickSize * maxLevels * 2;
      return distance <= maxDistance;
    })
    .slice(0, maxLevels * 2);

  const maxVolume = Math.max(...visibleClusters.map(c => c.volume), 1);

  if (isCME) {
    return (
      <div className="h-full flex flex-col">
        <div className="text-xs text-zinc-500 mb-2">Cluster (Bid/Ask/Delta)</div>
        <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
          Real-time data not available for CME
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with totals */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-800">
        <span className="text-xs text-zinc-500">Cluster</span>
        <div className="flex gap-3 text-xs">
          <span className="text-teal-400">B: {totals.bid.toFixed(2)}</span>
          <span className="text-red-400">A: {totals.ask.toFixed(2)}</span>
          <span className={totals.delta >= 0 ? 'text-teal-400' : 'text-red-400'}>
            D: {totals.delta >= 0 ? '+' : ''}{totals.delta.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-5 gap-1 text-xs text-zinc-500 mb-1 px-1">
        <span>Bid</span>
        <span className="text-center">Price</span>
        <span className="text-right">Ask</span>
        <span className="text-right">Vol</span>
        <span className="text-right">Delta</span>
      </div>

      {/* Cluster levels */}
      <div className="flex-1 overflow-y-auto space-y-0.5">
        {visibleClusters.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
            Collecting trades...
          </div>
        ) : (
          visibleClusters.map((cluster) => {
            const volumePercent = (cluster.volume / maxVolume) * 100;
            const isAtPrice = currentPrice && Math.abs(cluster.price - currentPrice) < tickSize;

            return (
              <div
                key={cluster.price}
                className={`grid grid-cols-5 gap-1 text-xs py-0.5 px-1 relative ${
                  isAtPrice ? 'bg-zinc-800/50' : ''
                }`}
              >
                {/* Volume bar background */}
                <div
                  className="absolute inset-0 opacity-20"
                  style={{
                    background: cluster.delta >= 0
                      ? `linear-gradient(90deg, transparent ${100 - volumePercent}%, rgba(38, 166, 154, 0.5) ${100 - volumePercent}%)`
                      : `linear-gradient(90deg, transparent ${100 - volumePercent}%, rgba(239, 68, 68, 0.5) ${100 - volumePercent}%)`,
                  }}
                />

                {/* Bid */}
                <span className="text-teal-400 relative z-10">
                  {cluster.bid > 0 ? cluster.bid.toFixed(2) : '-'}
                </span>

                {/* Price */}
                <span className={`text-center relative z-10 ${isAtPrice ? 'text-yellow-400 font-medium' : 'text-zinc-400'}`}>
                  {cluster.price.toLocaleString()}
                </span>

                {/* Ask */}
                <span className="text-red-400 text-right relative z-10">
                  {cluster.ask > 0 ? cluster.ask.toFixed(2) : '-'}
                </span>

                {/* Volume */}
                <span className="text-zinc-400 text-right relative z-10">
                  {cluster.volume.toFixed(2)}
                </span>

                {/* Delta */}
                <span className={`text-right relative z-10 ${cluster.delta >= 0 ? 'text-teal-400' : 'text-red-400'}`}>
                  {cluster.delta >= 0 ? '+' : ''}{cluster.delta.toFixed(2)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Delta bar */}
      <div className="mt-2 pt-2 border-t border-zinc-800">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-teal-400">Buyers</span>
          <span className="text-red-400">Sellers</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
          <div
            className="bg-teal-500 transition-all duration-300"
            style={{
              width: `${totals.bid + totals.ask > 0 ? (totals.bid / (totals.bid + totals.ask)) * 100 : 50}%`,
            }}
          />
          <div
            className="bg-red-500 transition-all duration-300"
            style={{
              width: `${totals.bid + totals.ask > 0 ? (totals.ask / (totals.bid + totals.ask)) * 100 : 50}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
