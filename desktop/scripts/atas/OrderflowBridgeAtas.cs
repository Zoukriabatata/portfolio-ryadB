// OrderflowBridgeAtas.cs — v5
// Changements v5 :
// - Attente réelle des données cluster (jusqu'à 3 min pour charts daily)
// - GetCandle(b) retourné comme object — plus de cast IndicatorCandle silencieusement null
// - Fallback OHLCV : barre visible même si ATAS n'a pas de tick data historique
// - Plus de noms de méthodes/propriétés ATAS testés en réflexion
// - Log du type runtime de GetCandle(0) pour diagnostic

using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using ATAS.Indicators;

namespace OrderflowV2Bridge
{
    [DisplayName("Orderflow Bridge")]
    [Description("TCP bridge to the orderflow-v2 desktop app (history + live).")]
    public class OrderflowBridgeAtas : Indicator
    {
        // ── Paramètres utilisateur ────────────────────────────────────────
        public int Port { get; set; } = 7274;
        public decimal FallbackTickSize { get; set; } = 0.25m;

        // ── Diagnostics visibles dans ATAS Settings ───────────────────────
        [DisplayName("History Bars Sent")]
        public int HistoryBarsSent { get; private set; } = 0;

        [DisplayName("History Ticks Sent")]
        public int HistoryTicksSent { get; private set; } = 0;

        [DisplayName("History Synthetic Bars")]
        public int HistorySyntheticBars { get; private set; } = 0;

        [DisplayName("Last Bar Index")]
        public int LastBarIndex { get; private set; } = -1;

        // ── Constantes ────────────────────────────────────────────────────
        private static readonly CultureInfo IC = CultureInfo.InvariantCulture;
        private static readonly long EPOCH_TICKS = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc).Ticks;
        private const int PING_INTERVAL_SECS = 5;
        private const int SENDER_POLL_MS = 5;
        private const int OUTBOX_CAP = 1_000_000;
        private const int HIST_FLUSH_EVERY = 5_000;

        // ── État interne ──────────────────────────────────────────────────
        private TcpListener _listener;
        private TcpClient _currentClient;
        private Thread _serverThread;
        private Thread _senderThread;
        private volatile bool _running;

        private readonly ConcurrentQueue<string> _liveOutbox = new ConcurrentQueue<string>();
        // Bar index → serialized H lines. Built in OnCalculate (the ATAS
        // calc thread — the ONLY context where GetCandle() is valid). The
        // sender thread snapshots this on client connect. Calling GetCandle
        // from the sender thread throws "Indicator doesn't support working
        // with candles" — the bug that made history return 0 bars.
        private readonly ConcurrentDictionary<int, string[]> _barLines =
            new ConcurrentDictionary<int, string[]>();
        // Cluster-levels API name discovered by reflection on the first
        // candle (e.g. "method:GetAllPriceLevels"), reused for later bars.
        private string _levelsApi = "none";
        private volatile bool _metaReady;
        private string _metaLine = "M,UNKNOWN,0.25000000,0";
        private string _currentInstrumentName = string.Empty;

        // Mis à jour par OnCalculate (thread ATAS), lu par SenderLoop (background thread)
        private volatile int _lastBarIndex = -1;

        private string _logPath;

        // ── Cycle de vie ──────────────────────────────────────────────────

        protected override void OnInitialize()
        {
            _running = true;
            _metaReady = false;
            _lastBarIndex = -1;
            _currentInstrumentName = string.Empty;
            HistoryBarsSent = 0;
            HistoryTicksSent = 0;
            HistorySyntheticBars = 0;
            LastBarIndex = -1;
            while (_liveOutbox.TryDequeue(out _)) { }

            try
            {
                _logPath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
                    "atas_bridge.log");
                File.WriteAllText(_logPath, $"[{Now()}] OnInitialize — port {Port}\n");
            }
            catch { _logPath = null; }

            StartServerThread();
            StartSenderThread();
            Log($"Listening on 127.0.0.1:{Port}");
        }

        protected override void OnDispose()
        {
            _running = false;
            Log("OnDispose");
            try { _listener?.Stop(); } catch { }
            try { _currentClient?.Close(); } catch { }
            _serverThread?.Join(2000);
            _senderThread?.Join(2000);
        }

        protected override void OnCalculate(int bar, decimal value)
        {
            EnsureInstrumentMeta();
            if (bar > _lastBarIndex)
            {
                _lastBarIndex = bar;
                LastBarIndex = bar;
            }
            // Serialize this bar's footprint NOW, on the ATAS calc thread —
            // GetCandle() is only valid here. The sender thread later
            // snapshots _barLines. Closed bars are immutable; the forming
            // bar overwrites each tick (harmless). Wrapped so a single bad
            // bar can never throw out of OnCalculate.
            try
            {
                string[] lines = SerializeBar(bar);
                if (lines != null) _barLines[bar] = lines;
            }
            catch { /* never throw from OnCalculate */ }
        }

        // Serialize one bar's footprint to H lines. MUST run on the ATAS
        // calc thread (called from OnCalculate) — GetCandle is invalid
        // elsewhere. Cluster path first (real per-price bid/ask); falls
        // back to the candle's own total Ask/Bid split when there are no
        // per-price levels (ATAS feed without footprint depth).
        private string[] SerializeBar(int bar)
        {
            // GetCandle returns IndicatorCandle. Typed access — the previous
            // reflection probe failed because GetAllPriceLevels() has TWO
            // overloads, so Type.GetMethod(name) threw AmbiguousMatchException
            // and silently fell through to "NOT_FOUND" (and flooded the log).
            IndicatorCandle ic;
            try { ic = GetCandle(bar); }
            catch { return null; }
            if (ic == null) return null;

            long tsNs = ToUnixNanos(ic.Time);
            var lines = new List<string>(8);
            bool hadTick = false;

            // Cluster path — real per-price bid/ask volume. Collect the
            // levels, then emit so the FIRST H line is at the bar's Open
            // price and the LAST at its Close. The engine derives O/C from
            // tick ORDER, but ATAS clusters are price-aggregated (intra-bar
            // time order is lost), so without this every historical candle
            // would render as a full-range green bar (open=low, close=high).
            // High/Low are unaffected (max/min over all level prices).
            try
            {
                var lv = new List<PriceVolumeInfo>();
                foreach (PriceVolumeInfo pv in ic.GetAllPriceLevels())
                    if ((long)pv.Ask > 0 || (long)pv.Bid > 0) lv.Add(pv);

                decimal openP = ic.Open, closeP = ic.Close;
                lv.Sort((x, y) =>
                {
                    int rx = x.Price == openP ? 0 : (x.Price == closeP ? 2 : 1);
                    int ry = y.Price == openP ? 0 : (y.Price == closeP ? 2 : 1);
                    if (rx != ry) return rx.CompareTo(ry);
                    return x.Price.CompareTo(y.Price);
                });

                foreach (PriceVolumeInfo pv in lv)
                {
                    long askVol = (long)pv.Ask;
                    long bidVol = (long)pv.Bid;
                    string ps = pv.Price.ToString("F4", IC);
                    if (askVol > 0) { lines.Add(string.Format(IC, "H,{0},{1},{2},0", tsNs, ps, askVol)); hadTick = true; }
                    if (bidVol > 0) { lines.Add(string.Format(IC, "H,{0},{1},{2},1", tsNs, ps, bidVol)); hadTick = true; }
                }
            }
            catch (Exception ex) { Log($"GetAllPriceLevels error bar {bar}: {ex.Message}"); }

            // Fallback — bar has no per-price levels: use the candle's own
            // total Ask/Bid (buy/sell) split at the close price.
            if (!hadTick)
            {
                decimal closePrice = ic.Close;
                decimal vol        = ic.Volume;
                decimal buyVol     = ic.Ask;
                decimal sellVol    = ic.Bid;
                if (buyVol <= 0 && sellVol <= 0 && vol > 0)
                {
                    buyVol  = closePrice >= ic.Open ? vol : vol / 2m;
                    sellVol = vol - buyVol;
                }
                if (closePrice > 0 && vol > 0)
                {
                    string ps = closePrice.ToString("F4", IC);
                    if (buyVol  > 0) lines.Add(string.Format(IC, "H,{0},{1},{2},0", tsNs, ps, (long)buyVol));
                    if (sellVol > 0) lines.Add(string.Format(IC, "H,{0},{1},{2},1", tsNs, ps, (long)sellVol));
                }
            }

            return lines.Count > 0 ? lines.ToArray() : null;
        }

        private void EnsureInstrumentMeta()
        {
            decimal tick = FallbackTickSize;
            string sym = "UNKNOWN";
            try
            {
                if (InstrumentInfo != null)
                {
                    if (InstrumentInfo.TickSize > 0) tick = InstrumentInfo.TickSize;
                    if (!string.IsNullOrEmpty(InstrumentInfo.Instrument)) sym = InstrumentInfo.Instrument;
                }
            }
            catch { }
            if (tick <= 0) tick = FallbackTickSize;

            if (sym == _currentInstrumentName && _metaReady) return;

            bool isSwitch = _metaReady && sym != _currentInstrumentName;
            _currentInstrumentName = sym;
            _metaLine = string.Format(IC, "M,{0},{1},0", EscapeSymbol(sym), tick.ToString("F8", IC));

            if (isSwitch)
            {
                _barLines.Clear();
                _levelsApi = "none";
                _liveOutbox.Enqueue(_metaLine);
                _liveOutbox.Enqueue("E");
            }
            _metaReady = true;
        }

        protected override void OnNewTrade(MarketDataArg arg)
        {
            if (!_running) return;
            if (arg.DataType != MarketDataType.Trade) return;

            long tsNs = ToUnixNanos(arg.Time);
            long qty  = (long)Math.Max(1m, arg.Volume);
            int side  = arg.Direction == TradeDirection.Sell ? 1 : 0;

            if (_liveOutbox.Count < OUTBOX_CAP)
                _liveOutbox.Enqueue(string.Format(IC, "L,{0},{1},{2},{3}",
                    tsNs.ToString(IC), arg.Price.ToString("F4", IC), qty.ToString(IC), side));
        }

        // ── Historical backfill ───────────────────────────────────────────

        private List<string> BuildHistoryLines()
        {
            // Phase 1 : attendre qu'OnCalculate ait traité au moins 2 barres (OHLC rapide)
            Log("BuildHistoryLines: attente _lastBarIndex >= 1…");
            for (int attempt = 0; attempt < 40 && _lastBarIndex < 1; attempt++)
                Thread.Sleep(250);

            int lastBar = _lastBarIndex;
            Log($"BuildHistoryLines: _lastBarIndex={lastBar}");

            if (lastBar < 1)
            {
                Log("BuildHistoryLines: 0 barres fermées, retour vide");
                HistoryBarsSent     = 0;
                HistoryTicksSent    = 0;
                HistorySyntheticBars = 0;
                return new List<string>(0);
            }

            // Phase 2 : diagnostiquer le type runtime de GetCandle(0) — utile pour le log
            try
            {
                object probe = GetCandle(0);
                if (probe == null)
                {
                    Log("GetCandle(0) = null");
                }
                else
                {
                    Type pt = probe.GetType();
                    Log($"GetCandle(0) runtime type: {pt.FullName}");
                    var mList = new List<string>();
                    foreach (MethodInfo mi in pt.GetMethods(BindingFlags.Public | BindingFlags.Instance))
                        if (!mi.IsSpecialName) mList.Add(mi.Name + "()");
                    foreach (PropertyInfo pi in pt.GetProperties(BindingFlags.Public | BindingFlags.Instance))
                        mList.Add(pi.Name);
                    Log($"Membres runtime: {string.Join(", ", mList.ToArray())}");
                }
            }
            catch (Exception ex) { Log($"Probe GetCandle(0) error: {ex.Message}"); }

            // Phase 3 : attendre que les données cluster soient disponibles sur la barre 0
            // Pour un chart DAILY, ATAS rejoue des semaines de ticks — peut prendre 1-3 minutes
            const int MAX_WAIT_MS   = 10_000; // 10 secondes
            const int POLL_MS       = 1_000;
            int waitedMs            = 0;
            string probeApi         = "none";
            bool clusterAvailable   = false;

            Log("Phase 3: attente données cluster sur bar 0…");
            while (waitedMs < MAX_WAIT_MS)
            {
                try
                {
                    object c0 = GetCandle(0);
                    if (c0 != null)
                    {
                        IEnumerable lvls = GetPriceLevelsObj(c0, ref probeApi);
                        if (lvls != null)
                        {
                            foreach (var _ in lvls) { clusterAvailable = true; break; }
                        }
                    }
                }
                catch { }

                if (clusterAvailable) break;

                Thread.Sleep(POLL_MS);
                waitedMs += POLL_MS;
                if (waitedMs % 15_000 == 0)
                    Log($"Attente cluster... {waitedMs / 1000}s écoulées (probeApi={probeApi})");
            }

            if (!clusterAvailable)
                Log($"WARN: aucun cluster data après {MAX_WAIT_MS / 1000}s. probeApi={probeApi}. " +
                    "ATAS n'a probablement pas de tick data historique pour ces barres. Fallback OHLCV activé.");
            else
                Log($"Cluster disponible après {waitedMs}ms (api={probeApi})");

            // Phase 4 : itérer toutes les barres fermées et sérialiser
            var lines   = new List<string>(lastBar * 6);
            string apiUsed  = clusterAvailable ? probeApi : "none";
            int barsRead    = 0;
            int nullCandles = 0;
            int noLevels    = 0;
            int syntheticBars = 0;

            try
            {
                for (int b = 0; b < lastBar; b++)
                {
                    object rawCandle;
                    try { rawCandle = GetCandle(b); }
                    catch (Exception ex) { Log($"GetCandle({b}) exception: {ex.Message}"); continue; }

                    if (rawCandle == null) { nullCandles++; continue; }

                    long tsNs = GetCandleTimeNs(rawCandle);
                    IEnumerable levels = clusterAvailable
                        ? GetPriceLevelsObj(rawCandle, ref apiUsed)
                        : null;

                    bool hadTick = false;

                    // ── Chemin cluster ────────────────────────────────────
                    if (levels != null)
                    {
                        foreach (var obj in levels)
                        {
                            try
                            {
                                Type t    = obj.GetType();
                                decimal price  = GetDecimal(t, obj, "Price");
                                decimal ask    = GetDecimal(t, obj, "Ask");
                                decimal bid    = GetDecimal(t, obj, "Bid");
                                long askVol = (long)ask;
                                long bidVol = (long)bid;
                                string ps = price.ToString("F4", IC);
                                if (askVol > 0) { lines.Add(string.Format(IC, "H,{0},{1},{2},0", tsNs, ps, askVol)); hadTick = true; }
                                if (bidVol > 0) { lines.Add(string.Format(IC, "H,{0},{1},{2},1", tsNs, ps, bidVol)); hadTick = true; }
                            }
                            catch { }
                        }
                    }

                    // ── Fallback OHLCV si aucun niveau ───────────────────
                    // Envoie un tick synthétique au prix close avec volume total.
                    // Permet à la barre d'apparaître dans le chart même sans footprint.
                    if (!hadTick)
                    {
                        noLevels++;
                        decimal closePrice = GetDecimalProp(rawCandle, "Close");
                        decimal vol        = GetDecimalProp(rawCandle, "Volume");
                        decimal buyVol     = GetDecimalProp(rawCandle, "BuyVolume");
                        decimal sellVol    = GetDecimalProp(rawCandle, "SellVolume");

                        if (buyVol <= 0 && sellVol <= 0 && vol > 0)
                        {
                            // Pas de split bid/ask dispo : estimer depuis la direction
                            decimal openPrice = GetDecimalProp(rawCandle, "Open");
                            buyVol  = closePrice >= openPrice ? vol : vol / 2m;
                            sellVol = vol - buyVol;
                        }

                        if (closePrice > 0 && vol > 0)
                        {
                            string ps = closePrice.ToString("F4", IC);
                            if (buyVol  > 0) { lines.Add(string.Format(IC, "H,{0},{1},{2},0", tsNs, ps, (long)buyVol));  hadTick = true; }
                            if (sellVol > 0) { lines.Add(string.Format(IC, "H,{0},{1},{2},1", tsNs, ps, (long)sellVol)); hadTick = true; }
                            if (hadTick) syntheticBars++;
                        }
                    }

                    if (hadTick) barsRead++;
                }
            }
            catch (Exception ex)
            {
                Log($"BuildHistoryLines loop exception: {ex.Message}");
            }

            UpdateMetaCount(lines.Count);
            HistoryBarsSent      = barsRead;
            HistoryTicksSent     = lines.Count;
            HistorySyntheticBars = syntheticBars;

            Log($"BuildHistoryLines done: api={apiUsed}, totalBars={lastBar}, barsWithData={barsRead}, " +
                $"nullCandles={nullCandles}, noLevels={noLevels}, synthetic={syntheticBars}, ticks={lines.Count}");
            return lines;
        }

        // ── Extraction des niveaux de prix ────────────────────────────────
        // Travaille avec object directement pour éviter le cast IndicatorCandle silencieusement null.

        private IEnumerable GetPriceLevelsObj(object candle, ref string apiUsed)
        {
            if (candle == null) return null;

            // Réutilise l'API déjà découverte
            if (apiUsed != "none" && !apiUsed.StartsWith("NOT_FOUND"))
                return GetByKnownApiObj(candle, apiUsed);

            Type t = candle.GetType();

            // Méthodes — ATAS v5.x et v6.x
            foreach (string name in new[] {
                "GetAllPriceLevels",
                "GetCandlePriceLevels", "GetPriceLevels", "GetAllPriceVolumes",
                "GetPriceVolumes",      "GetClusterLevels", "GetFootprint",
                "GetClusters",          "GetClusterData",   "GetLevels",
                "GetPriceVolumeSeries", "GetFootprintLevels"
            })
            {
                try
                {
                    MethodInfo m = t.GetMethod(name, BindingFlags.Public | BindingFlags.Instance);
                    if (m == null) continue;
                    object r = m.Invoke(candle, null);
                    if (r is IEnumerable e && !(r is string))
                    { apiUsed = "method:" + name; Log($"API trouvée: {apiUsed}"); return e; }
                }
                catch { }
            }

            // IEnumerable direct (non-string)
            if (candle is IEnumerable direct && !(candle is string))
            { apiUsed = "foreach"; Log("API trouvée: foreach"); return direct; }

            // Propriétés — ATAS v5.x et v6.x
            foreach (string name in new[] {
                "PriceLevels",    "Volumes",       "PriceVolumes",  "Clusters",
                "ClusterData",    "FootprintData", "Levels",        "ClusterValues",
                "ClusterItems",   "Items",         "VolumeLevels",  "PriceVolumeList",
                "FootprintLevels"
            })
            {
                try
                {
                    PropertyInfo p = t.GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
                    if (p == null) continue;
                    object r = p.GetValue(candle);
                    if (r is IEnumerable e && !(r is string))
                    { apiUsed = "prop:" + name; Log($"API trouvée: {apiUsed}"); return e; }
                }
                catch { }
            }

            // Diagnostic — liste tous les membres visibles
            var members = new List<string>();
            try
            {
                foreach (MethodInfo mi in t.GetMethods(BindingFlags.Public | BindingFlags.Instance))
                    if (!mi.IsSpecialName) members.Add(mi.Name + "()");
                foreach (PropertyInfo pi in t.GetProperties(BindingFlags.Public | BindingFlags.Instance))
                    members.Add(pi.Name);
            }
            catch { }
            apiUsed = "NOT_FOUND";
            Log($"API NOT_FOUND sur {t.FullName}. Membres: {string.Join(", ", members.ToArray())}");
            return null;
        }

        private IEnumerable GetByKnownApiObj(object candle, string apiKey)
        {
            try
            {
                if (apiKey == "foreach") return candle as IEnumerable;
                if (apiKey.StartsWith("method:"))
                {
                    MethodInfo m = candle.GetType().GetMethod(
                        apiKey.Substring(7), BindingFlags.Public | BindingFlags.Instance);
                    if (m != null) return m.Invoke(candle, null) as IEnumerable;
                }
                if (apiKey.StartsWith("prop:"))
                {
                    PropertyInfo p = candle.GetType().GetProperty(
                        apiKey.Substring(5), BindingFlags.Public | BindingFlags.Instance);
                    if (p != null) return p.GetValue(candle) as IEnumerable;
                }
            }
            catch { }
            return null;
        }

        // ── Helpers sur candle object ─────────────────────────────────────

        private long GetCandleTimeNs(object candle)
        {
            // Réflexion pour être compatible avec toutes les versions du SDK ATAS
            Type t = candle.GetType();
            foreach (string name in new[] { "Time", "TimeStart", "OpenTime", "Date", "StartTime" })
            {
                try
                {
                    PropertyInfo p = t.GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
                    if (p == null) continue;
                    object v = p.GetValue(candle);
                    if (v is DateTime dt) return ToUnixNanos(dt);
                }
                catch { }
            }
            return 0L;
        }

        private decimal GetDecimalProp(object obj, string propName, decimal def = 0m)
        {
            try
            {
                PropertyInfo p = obj.GetType().GetProperty(
                    propName, BindingFlags.Public | BindingFlags.Instance);
                if (p == null) return def;
                object v = p.GetValue(obj);
                if (v == null) return def;
                return Convert.ToDecimal(v);
            }
            catch { return def; }
        }

        private static decimal GetDecimal(Type t, object obj, string propName)
        {
            PropertyInfo p = t.GetProperty(propName);
            if (p == null) return 0m;
            try
            {
                object v = p.GetValue(obj);
                if (v is decimal d)  return d;
                if (v is double db)  return (decimal)db;
                if (v is long l)     return (decimal)l;
                return Convert.ToDecimal(v);
            }
            catch { return 0m; }
        }

        private void UpdateMetaCount(int count)
        {
            int lastComma = _metaLine.LastIndexOf(',');
            if (lastComma >= 0)
                _metaLine = _metaLine.Substring(0, lastComma + 1) + count.ToString(IC);
        }

        // ── Server thread ─────────────────────────────────────────────────

        private void StartServerThread()
        {
            _serverThread = new Thread(ServerLoop) { IsBackground = true, Name = "OFBridge-Server" };
            _serverThread.Start();
        }

        private void ServerLoop()
        {
            try
            {
                _listener = new TcpListener(IPAddress.Loopback, Port);
                _listener.Start();
            }
            catch (Exception ex) { Log($"Bind error: {ex.Message}"); _running = false; return; }

            while (_running)
            {
                try
                {
                    TcpClient client = _listener.AcceptTcpClient();
                    client.NoDelay = true;
                    try { _currentClient?.Close(); } catch { }
                    _currentClient = client;
                    Log("Client TCP connecté");
                }
                catch (SocketException) when (!_running) { return; }
                catch (ObjectDisposedException) { return; }
                catch (Exception ex) { Log($"Accept error: {ex.Message}"); Thread.Sleep(500); }
            }
        }

        // ── Sender thread ─────────────────────────────────────────────────

        private void StartSenderThread()
        {
            _senderThread = new Thread(SenderLoop) { IsBackground = true, Name = "OFBridge-Sender" };
            _senderThread.Start();
        }

        private void SenderLoop()
        {
            while (_running)
            {
                TcpClient client = _currentClient;
                if (client == null || !IsAlive(client)) { Thread.Sleep(100); continue; }

                try
                {
                    NetworkStream ns = client.GetStream();
                    using (var writer = new StreamWriter(ns, new UTF8Encoding(false)) { AutoFlush = false, NewLine = "\n" })
                    {
                        while (_running && !_metaReady && IsAlive(client)) Thread.Sleep(50);
                        if (!_running || !IsAlive(client)) { CloseClient(client); continue; }

                        while (_liveOutbox.TryDequeue(out _)) { }

                        // ATAS loads chart history progressively, and
                        // OnCalculate fills _barLines as it goes. Wait until
                        // the bar count stops growing (~600 ms stable) so we
                        // ship the FULL history, not a partial early snapshot.
                        // Caps at 60 s for very deep charts.
                        {
                            int prev = -1, stableTicks = 0, waitedMs = 0;
                            while (_running && IsAlive(client) && waitedMs < 60000)
                            {
                                int c = _barLines.Count;
                                if (c > 0 && c == prev) { if (++stableTicks >= 6) break; }
                                else { stableTicks = 0; prev = c; }
                                Thread.Sleep(100);
                                waitedMs += 100;
                            }
                            Log($"history cache stable at {_barLines.Count} bars after {waitedMs}ms");
                        }

                        // Snapshot the per-bar cache built by OnCalculate
                        // (sorted oldest → newest). GetCandle already ran on
                        // the correct thread; here we just ship strings.
                        var barKeys = new List<int>(_barLines.Keys);
                        barKeys.Sort();
                        var hist = new List<string>(barKeys.Count * 6);
                        foreach (int k in barKeys)
                            if (_barLines.TryGetValue(k, out string[] bl) && bl != null)
                                hist.AddRange(bl);
                        HistoryBarsSent  = barKeys.Count;
                        HistoryTicksSent = hist.Count;
                        UpdateMetaCount(hist.Count);
                        Log($"Envoi: M + {hist.Count} H ticks (from {barKeys.Count} cached bars) + E");

                        writer.WriteLine(_metaLine);
                        writer.Flush();
                        int written = 0;
                        foreach (string h in hist)
                        {
                            writer.WriteLine(h);
                            if (++written % HIST_FLUSH_EVERY == 0) writer.Flush();
                        }
                        writer.WriteLine("E");
                        writer.Flush();
                        Log("E envoyé — mode live");

                        DateTime lastPing = DateTime.UtcNow;
                        while (_running && IsAlive(client))
                        {
                            bool wrote = false;
                            while (_liveOutbox.TryDequeue(out string live)) { writer.WriteLine(live); wrote = true; }
                            if ((DateTime.UtcNow - lastPing).TotalSeconds >= PING_INTERVAL_SECS)
                            { writer.WriteLine("P"); lastPing = DateTime.UtcNow; wrote = true; }
                            if (wrote) writer.Flush();
                            Thread.Sleep(SENDER_POLL_MS);
                        }
                    }
                }
                catch (IOException) { Log("Client déconnecté (IOException)"); }
                catch (ObjectDisposedException) { }
                catch (Exception ex) { Log($"Sender error: {ex.Message}"); }
                finally { CloseClient(client); Thread.Sleep(200); }
            }
        }

        // ── Helpers génériques ────────────────────────────────────────────

        private static bool IsAlive(TcpClient c) { try { return c != null && c.Connected; } catch { return false; } }
        private void CloseClient(TcpClient c) { try { c?.Close(); } catch { } if (_currentClient == c) _currentClient = null; }

        private static long ToUnixNanos(DateTime dt)
        {
            DateTime utc = dt.Kind == DateTimeKind.Utc ? dt : dt.ToUniversalTime();
            return (utc.Ticks - EPOCH_TICKS) * 100L;
        }

        private static string EscapeSymbol(string s)
        {
            if (string.IsNullOrEmpty(s)) return "UNKNOWN";
            return s.Replace(",", "_").Replace("\n", " ").Replace("\r", " ");
        }

        private static string Now() => DateTime.Now.ToString("HH:mm:ss.fff", IC);

        private void Log(string msg)
        {
            if (_logPath == null) return;
            try { File.AppendAllText(_logPath, $"[{Now()}] {msg}\n"); }
            catch { }
        }
    }
}
