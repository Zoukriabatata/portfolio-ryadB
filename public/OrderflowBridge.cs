// OrderflowBridge.cs
// =====================================================================
// TCP bridge for the orderflow-v2 desktop app.
// Streams tick-by-tick history + live trades from NinjaTrader 8
// (running on its existing Apex/Rithmic session) to our Tauri app
// via a CSV-line protocol on 127.0.0.1:<port>.
//
// INSTALLATION
//   1. Copy this file to:
//        Documents\NinjaTrader 8\bin\Custom\Indicators\OrderflowBridge.cs
//   2. NT8 → Tools → NinjaScript Editor → Compile (F5). Must show 0 errors.
//   3. Open a chart with the desired instrument:
//        Bars Period TYPE  = Tick
//        Bars Period VALUE = 100      <-- IMPORTANT: 100, NOT 1
//        Tick Replay       = ON       (Properties → Data Series)
//      with the desired history (e.g. 24 hours).
//      Why 100 Tick and not 1 Tick: a 1-Tick chart over 24h MNQ creates
//      5M+ NinjaTrader bars and hits internal limits — 1m candles end up
//      decorrelated from NT's native 1m chart. 100 Tick = ~30k NT bars
//      AND Tick Replay still delivers per-tick OnMarketData callbacks,
//      so we keep tick-by-tick granularity (~95% aggressor accuracy)
//      without saturating NT.
//   4. Add indicator "OrderflowBridge" to the chart.
//   5. The Output window should print "OrderflowBridge: listening on 127.0.0.1:7272".
//
// WIRE PROTOCOL (UTF-8, newline-terminated)
//   M,<symbol>,<tick_size>,<n_historical>   one-shot header
//   H,<ts_ns>,<price>,<qty>,<side>          historical tick (0=Buy 1=Sell)
//   E                                        end-of-history sentinel
//   L,<ts_ns>,<price>,<qty>,<side>          live tick
//   V,<ts_ns>,<daily_volume>                exchange-pushed session vol
//   P                                        ping / keepalive (every 5s)
//
// SAFETY
//   - Binds on 127.0.0.1 only (loopback). Never on 0.0.0.0.
//   - All socket I/O on background threads — NT chart thread never blocks.
// =====================================================================

#region Using declarations
using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
#endregion

namespace NinjaTrader.NinjaScript.Indicators
{
    public class OrderflowBridge : Indicator
    {
        // ── Properties (UI) ────────────────────────────────────────────────
        [Range(1024, 65535)]
        [NinjaScriptProperty]
        [Display(Name = "Port", Description = "TCP port on loopback (1024-65535)",
                 Order = 1, GroupName = "Bridge")]
        public int Port { get; set; } = 7272;

        [Range(0.00001, 1000.0)]
        [NinjaScriptProperty]
        [Display(Name = "TickSize (fallback)", Description = "Fallback tick size — IGNORED in normal use. The bridge reads the real tick size from the instrument (GC/MGC 0.1, MNQ 0.25, …). Only used if the platform can't supply it.",
                 Order = 2, GroupName = "Bridge")]
        public double TickSizeProp { get; set; } = 0.25;

        // ── Constants ──────────────────────────────────────────────────────
        private static readonly CultureInfo IC = CultureInfo.InvariantCulture;
        private static readonly long EPOCH_TICKS = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc).Ticks;
        private const int PING_INTERVAL_SECS = 5;
        private const int SENDER_POLL_MS     = 5;

        // ── Server / threading state ───────────────────────────────────────
        private TcpListener   _listener;
        private TcpClient     _currentClient;
        private Thread        _serverThread;
        private Thread        _senderThread;
        private volatile bool _running;

        // ── Data buffers ───────────────────────────────────────────────────
        // _historicalBatch is only written during State.Historical (NT thread,
        // single writer) then read-only after _backfillComplete is set true.
        private readonly List<string> _historicalBatch = new List<string>(capacity: 1024);
        private readonly ConcurrentQueue<string> _liveOutbox = new ConcurrentQueue<string>();
        private volatile bool _backfillComplete;
        private string _metaLine = "M,?,0,0";

        // ── Aggressor classification ───────────────────────────────────────
        // LIVE: bid/ask tracked from OnMarketData (most accurate).
        // HISTORICAL: tick rule (uptick=buy, downtick=sell, zero-tick=carry).
        //   Standard Tick Bars do not store bid/ask volume per bar — that
        //   requires Volumetric Bars (add-on). Tick rule is the industry
        //   fallback (ATAS, Sierra Chart, etc.) and gives ~85-90% agreement
        //   with true aggressor flag on liquid futures like MNQ.
        private double _lastBid;
        private double _lastAsk;
        private double _prevHistPrice;
        private int    _prevHistSide;   // 0 = buy, 1 = sell

        // ── Broker-side daily volume ───────────────────────────────────────
        // NinjaTrader's Market Analyzer "Daily volume" column reads the
        // exchange-pushed cumulative session volume (via Rithmic feed),
        // NOT the sum of chart bars. That number is independent of when
        // NT started or how much chart history is loaded — it's what
        // CME reports for the contract since session open. We forward
        // it on a separate `V` wire line so the UI can show the
        // authoritative daily volume next to the bar-summed one.
        // Initial value 0 = "not seen yet".
        private long _lastDailyVolumeSent;

        // ── Heartbeat ──────────────────────────────────────────────────────
        private DateTime _lastPing = DateTime.MinValue;

        // ── Hard-guard flag ────────────────────────────────────────────────
        // Set to true in Configure if the chart is not a Tick chart.
        // All capture handlers bail out early when set — we'd rather stream
        // nothing than stream wrong data and silently corrupt the user's
        // footprint. The user sees a big ❌ block in Output explaining how
        // to fix it. Sender thread still starts the TCP listener so the
        // desktop app gets a clean "no data" rather than a TCP refused.
        private bool _invalidChart;

        // ═══════════════════════════════════════════════════════════════════
        // NinjaScript lifecycle
        // ═══════════════════════════════════════════════════════════════════

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Name                = "OrderflowBridge";
                Description         = "TCP bridge to orderflow-v2 desktop app (tick-by-tick history + live).";
                // OnBarClose — captures EVERY trade tick exactly once
                // on a 1-Tick chart.
                //
                // Why not OnPriceChange: it SKIPS ticks whose price
                // matches the previous tick. On low-volume contracts
                // (MNQ) the loss is ~1-5%, on high-volume contracts
                // (NQ/MES/ES) same-price clusters dominate and the
                // loss climbs to ~20% — visibly distorting cells and
                // bar volumes versus NinjaTrader's native chart.
                //
                // Why not OnEachTick: it fires extra OnBarUpdate calls
                // for bid/ask refresh events on the same bar, which
                // double-counts when we read `Close[0]` / `Volume[0]`.
                //
                // OnBarClose fires exactly when a bar closes (= when
                // the next tick arrives). We read Bars at INDEX 1
                // (the just-closed bar), not 0. One firing per tick,
                // no skips, no duplicates.
                Calculate           = Calculate.OnBarClose;
                IsOverlay           = true;
                DisplayInDataBox    = false;
                PaintPriceMarkers   = false;
                IsChartOnly         = false;
                IsSuspendedWhileInactive = false;
                MaximumBarsLookBack = MaximumBarsLookBack.Infinite;
                BarsRequiredToPlot  = 0;
            }
            else if (State == State.Configure)
            {
                // ── HARD GUARD: REJECT NON-TICK CHARTS ──────────────────
                // The bridge MUST run on a 1-Tick chart. On a Minute or
                // Second chart, each OnBarUpdate represents a full bar
                // collapsed into ONE point — we'd stream ~5k "ticks"
                // instead of the millions of real trades, producing a
                // footprint that's wildly decorrelated from NT's native
                // chart (~80% gap observed in the wild). We refuse to
                // operate in that mode and tell the user how to fix it.
                if (BarsPeriod.BarsPeriodType != BarsPeriodType.Tick)
                {
                    _invalidChart = true;
                    Print("");
                    Print("════════════════════════════════════════════════════════════");
                    Print("  OrderflowBridge: ❌ INVALID CHART TYPE — bridge DISABLED");
                    Print("════════════════════════════════════════════════════════════");
                    Print($"  This indicator is applied to a {BarsPeriod.BarsPeriodType} chart.");
                    Print("  OrderflowBridge requires a 1-TICK chart to function:");
                    Print("");
                    Print("    1. File → New → Chart");
                    Print("    2. Bars Period: Type = Tick, Value = 1");
                    Print("    3. Days to load: 1 (or more)");
                    Print("    4. Apply OrderflowBridge to the new Tick chart");
                    Print("");
                    Print("  Until then no data will be streamed to OrderflowV2.");
                    Print("════════════════════════════════════════════════════════════");
                    Print("");
                    return;
                }
            }
            else if (State == State.DataLoaded)
            {
                _running          = true;
                _backfillComplete = false;
                _historicalBatch.Clear();
                while (_liveOutbox.TryDequeue(out _)) { }

                StartServerThread();
                StartSenderThread();

                Print($"OrderflowBridge: listening on 127.0.0.1:{Port}");

                // ── Tick Replay diagnostics ─────────────────────────────
                // Tick Replay (set on the chart's Data Series, not via
                // script) makes OnMarketData fire for HISTORICAL ticks
                // too, not just live. With it on, we classify aggressor
                // via real BestBid/BestAsk match — ~95% accuracy. With
                // it off, we fall back to OnBarUpdate + tick rule —
                // ~70-85% accuracy. The script picks the right path
                // automatically via Bars.IsTickReplay.
                if (Bars != null && Bars.IsTickReplay)
                {
                    Print("OrderflowBridge: Tick Replay ON — using bid/ask "
                          + "classification for historical ticks (~95% accuracy).");
                }
                else
                {
                    Print("OrderflowBridge: Tick Replay is OFF on this chart. "
                          + "Bridge will use the tick-rule fallback (~85% aggressor "
                          + "accuracy). For maximum precision (~95%), right-click "
                          + "chart → Properties → Data Series → tick the 'Tick Replay' "
                          + "checkbox → OK, then remove + re-apply this indicator.");
                }
            }
            else if (State == State.Realtime)
            {
                // Backfill is done — finalize header and unblock sender.
                // Tick size is read straight from the instrument so every
                // contract reports its real grid automatically — GC/MGC 0.1,
                // MNQ/ES/NQ 0.25, CL 0.01, etc. No manual config needed.
                // TickSizeProp is only a defensive fallback if the platform
                // can't supply the master tick (should never happen on a
                // live chart).
                double effectiveTick = Instrument.MasterInstrument.TickSize;
                if (effectiveTick <= 0) effectiveTick = TickSizeProp;

                _metaLine = string.Format(IC,
                    "M,{0},{1},{2}",
                    EscapeSymbol(Instrument.FullName),
                    effectiveTick.ToString("F8", IC),
                    _historicalBatch.Count);

                Print($"OrderflowBridge: instrument tick size = {effectiveTick.ToString(IC)} ({Instrument.FullName})");

                _backfillComplete = true;
                Print($"OrderflowBridge: backfill complete — {_historicalBatch.Count} historical ticks ready");
            }
            else if (State == State.Terminated)
            {
                _running = false;
                try { _listener?.Stop();      } catch { }
                try { _currentClient?.Close(); } catch { }
                _serverThread?.Join(2000);
                _senderThread?.Join(2000);
                Print("OrderflowBridge: stopped");
            }
        }

        protected override void OnBarUpdate()
        {
            // Refuse to capture anything when the chart isn't a Tick
            // chart — see Configure for the user-facing reason.
            if (_invalidChart) return;

            // Need at least one CLOSED bar (index 1). With OnBarClose,
            // when OnBarUpdate first fires for CurrentBar==1, index 0
            // is the freshly-opened new bar and index 1 is the just-
            // closed bar we want to record.
            if (CurrentBar < 1) return;

            // Tick Replay path: when enabled, OnMarketData fires for
            // every historical tick (with real Bid/Ask events too),
            // so this OnBarUpdate-based capture becomes redundant AND
            // would double-count. Bail out — OnMarketData owns the
            // historical path in that mode.
            if (Bars != null && Bars.IsTickReplay) return;

            // Tick Replay OFF fallback — use OnBarUpdate + tick rule
            // (~85% aggressor accuracy on liquid futures).
            if (State == State.Historical)
                AppendHistoricalTick();
        }

        /// <summary>
        /// Classify the aggressor side of a trade given the latest
        /// known BestBid / BestAsk. Buy = lifted the offer, Sell =
        /// hit the bid. The mid-price fallback handles the rare case
        /// where a trade prints between the spread (e.g. iceberg
        /// reveal); the genuinely-unknown case (no bid/ask seen yet)
        /// arbitrarily returns Buy.
        ///
        /// Used identically by the historical path (Tick Replay) and
        /// the live path, so post-handover footprint cells line up
        /// instead of pivoting on the E sentinel.
        /// </summary>
        private int ClassifySide(double price)
        {
            if (_lastAsk > 0 && price >= _lastAsk) return 0; // Buy
            if (_lastBid > 0 && price <= _lastBid) return 1; // Sell
            if (_lastBid > 0 && _lastAsk > 0)
            {
                double mid = (_lastBid + _lastAsk) / 2.0;
                return price >= mid ? 0 : 1;
            }
            return 0; // No book yet — default Buy (very rare on Tick Replay)
        }

        protected override void OnMarketData(MarketDataEventArgs e)
        {
            // Refuse to capture anything when the chart isn't a Tick
            // chart — see Configure for the user-facing reason.
            if (_invalidChart) return;

            // ── Top-of-book trackers ─────────────────────────────────
            // Updated on every Bid / Ask event so ClassifySide can hit
            // them on the next Last event. Tick Replay feeds bid/ask
            // events for historical replay too, so this path also
            // bootstraps the classifier for the historical phase.
            if (e.MarketDataType == MarketDataType.Bid)
            {
                _lastBid = e.Price;
                return;
            }
            if (e.MarketDataType == MarketDataType.Ask)
            {
                _lastAsk = e.Price;
                return;
            }
            // Exchange-pushed cumulative session volume. NT forwards
            // CME's running daily volume counter as a DailyVolume
            // event — same source the Market Analyzer "Daily volume"
            // column reads. We push it on a separate `V` wire line on
            // every change so the desktop UI can show the
            // authoritative number alongside the bar-summed one.
            if (e.MarketDataType == MarketDataType.DailyVolume)
            {
                long v = (long)e.Volume;
                if (v != _lastDailyVolumeSent && v > 0)
                {
                    _lastDailyVolumeSent = v;
                    long tsNs = ToUnixNanos(e.Time);
                    _liveOutbox.Enqueue(string.Format(IC,
                        "V,{0},{1}",
                        tsNs.ToString(IC),
                        v.ToString(IC)));
                }
                return;
            }
            if (e.MarketDataType != MarketDataType.Last) return;

            double price = e.Price;
            long   qty   = (long)Math.Max(1, e.Volume);
            int    side  = ClassifySide(price);

            // ── Historical via Tick Replay ──────────────────────────
            // When Tick Replay is enabled, NT replays every historical
            // trade (and the bid/ask context around it) through this
            // handler during State.Historical. We capture them with
            // the SAME bid/ask classifier the live path uses — so
            // there's no quality gap on the H→E→L boundary.
            //
            // Critical: use e.Time (the trade's recorded timestamp),
            // NOT DateTime.UtcNow which would collapse every replayed
            // tick onto the moment of replay.
            if (State == State.Historical)
            {
                if (!Bars.IsTickReplay) return; // OnBarUpdate handles this case
                long tsNs = ToUnixNanos(e.Time);
                _historicalBatch.Add(string.Format(IC,
                    "H,{0},{1},{2},{3}",
                    tsNs.ToString(IC),
                    price.ToString("F4", IC),
                    qty.ToString(IC),
                    side));
                return;
            }

            // ── Live ────────────────────────────────────────────────
            // Real-time trades — push to outbox, sender thread flushes
            // immediately. Use e.Time (the exchange-stamped trade time)
            // so live ticks land in the SAME 1-minute bucket as NT's
            // native chart. Using UtcNow drifts ticks across the
            // minute boundary by 50-300 ms — invisible at 3m+ but
            // visible at 1m where it shifts OHLC and volume between
            // adjacent bars.
            long liveTsNs = ToUnixNanos(e.Time);
            string line = string.Format(IC,
                "L,{0},{1},{2},{3}",
                liveTsNs.ToString(IC),
                price.ToString("F4", IC),
                qty.ToString(IC),
                side);

            _liveOutbox.Enqueue(line);
        }

        // ═══════════════════════════════════════════════════════════════════
        // Historical tick accumulation
        // ═══════════════════════════════════════════════════════════════════

        private void AppendHistoricalTick()
        {
            // OnBarClose convention: read the JUST-CLOSED bar at
            // index 1 (the index 0 bar is the one that just opened
            // because of the new incoming tick — not yet ours to
            // record). This is what makes the historical capture
            // hit every trade tick exactly once, with no skips on
            // repeated-price clusters and no double-counting from
            // intra-bar quote refreshes.
            long tsNs = ToUnixNanos(Time[1]);
            double price = Close[1];
            long qty = (long)Volume[1];
            if (qty <= 0) return;

            // Tick rule for aggressor classification
            int side;
            if (_prevHistPrice <= 0)
                side = 0;                              // first tick — arbitrary
            else if (price > _prevHistPrice)
                side = 0;                              // uptick   → buy aggressor
            else if (price < _prevHistPrice)
                side = 1;                              // downtick → sell aggressor
            else
                side = _prevHistSide;                  // zero-tick → carry direction

            _prevHistPrice = price;
            _prevHistSide  = side;

            _historicalBatch.Add(string.Format(IC,
                "H,{0},{1},{2},{3}",
                tsNs.ToString(IC),
                price.ToString("F4", IC),
                qty.ToString(IC),
                side));
        }

        // ═══════════════════════════════════════════════════════════════════
        // Server thread — accepts one client at a time
        // ═══════════════════════════════════════════════════════════════════

        private void StartServerThread()
        {
            _serverThread = new Thread(ServerLoop)
            {
                IsBackground = true,
                Name         = "OrderflowBridge-Server"
            };
            _serverThread.Start();
        }

        private void ServerLoop()
        {
            try
            {
                _listener = new TcpListener(IPAddress.Loopback, Port);
                _listener.Start();
            }
            catch (Exception ex)
            {
                Print($"OrderflowBridge: cannot bind 127.0.0.1:{Port} — {ex.Message}");
                _running = false;
                return;
            }

            while (_running)
            {
                try
                {
                    TcpClient client = _listener.AcceptTcpClient();
                    client.NoDelay = true;  // Disable Nagle — minimize live tick latency

                    // Close any previous client (single-client policy)
                    try { _currentClient?.Close(); } catch { }
                    _currentClient = client;

                    Print($"OrderflowBridge: client connected from {client.Client.RemoteEndPoint}");
                }
                catch (SocketException) when (!_running) { return; }
                catch (ObjectDisposedException)          { return; }
                catch (Exception ex)
                {
                    Print($"OrderflowBridge: accept error: {ex.Message}");
                    Thread.Sleep(500);
                }
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // Sender thread — owns the socket writer
        // ═══════════════════════════════════════════════════════════════════

        private void StartSenderThread()
        {
            _senderThread = new Thread(SenderLoop)
            {
                IsBackground = true,
                Name         = "OrderflowBridge-Sender"
            };
            _senderThread.Start();
        }

        private void SenderLoop()
        {
            while (_running)
            {
                TcpClient client = _currentClient;
                if (client == null || !client.Connected)
                {
                    Thread.Sleep(100);
                    continue;
                }

                try
                {
                    NetworkStream ns = client.GetStream();
                    using (StreamWriter writer = new StreamWriter(ns, new UTF8Encoding(false))
                    {
                        AutoFlush = false,
                        NewLine   = "\n"
                    })
                    {
                        // Wait until historical backfill is complete
                        while (_running && !_backfillComplete && IsAlive(client))
                            Thread.Sleep(50);

                        if (!_running || !IsAlive(client))
                        {
                            CloseClient(client);
                            continue;
                        }

                        // Phase 1 — M header
                        writer.WriteLine(_metaLine);

                        // Phase 2 — replay historical batch
                        foreach (string line in _historicalBatch)
                            writer.WriteLine(line);

                        // Phase 3 — End-of-history sentinel
                        writer.WriteLine("E");
                        writer.Flush();

                        Print($"OrderflowBridge: streamed {_historicalBatch.Count} historical ticks + E");

                        // Phase 4 — live streaming + heartbeat
                        _lastPing = DateTime.UtcNow;

                        while (_running && IsAlive(client))
                        {
                            bool wrote = false;

                            while (_liveOutbox.TryDequeue(out string live))
                            {
                                writer.WriteLine(live);
                                wrote = true;
                            }

                            if ((DateTime.UtcNow - _lastPing).TotalSeconds >= PING_INTERVAL_SECS)
                            {
                                writer.WriteLine("P");
                                _lastPing = DateTime.UtcNow;
                                wrote = true;
                            }

                            if (wrote) writer.Flush();
                            Thread.Sleep(SENDER_POLL_MS);
                        }
                    }
                }
                catch (IOException)
                {
                    Print("OrderflowBridge: client disconnected");
                }
                catch (ObjectDisposedException) { /* shutting down */ }
                catch (Exception ex)
                {
                    Print($"OrderflowBridge: sender error: {ex.Message}");
                }
                finally
                {
                    CloseClient(client);
                    Thread.Sleep(200);
                }
            }
        }

        private static bool IsAlive(TcpClient c)
        {
            try { return c != null && c.Connected; }
            catch { return false; }
        }

        private void CloseClient(TcpClient c)
        {
            try { c?.Close(); } catch { }
            if (_currentClient == c) _currentClient = null;
        }

        // ═══════════════════════════════════════════════════════════════════
        // Helpers
        // ═══════════════════════════════════════════════════════════════════

        private static long ToUnixNanos(DateTime dt)
        {
            DateTime utc = dt.Kind == DateTimeKind.Utc ? dt : dt.ToUniversalTime();
            return (utc.Ticks - EPOCH_TICKS) * 100L;  // 1 .NET Tick = 100 ns
        }

        private static string EscapeSymbol(string s)
        {
            if (string.IsNullOrEmpty(s)) return "UNKNOWN";
            return s.Replace(",", "_").Replace("\n", " ").Replace("\r", " ");
        }
    }
}

// NOTE: NinjaTrader auto-generates the "#region NinjaScript generated code"
//       block below this point on compile. Do not add it manually — it would
//       produce CS0111 / CS0121 / CS0102 errors due to duplicate definitions.
