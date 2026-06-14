// QuantowerOrderflowBridge.cs — v3
// Protocole aligné avec le parser Rust (bridge/parser.rs) :
//
//   M,{symbol},{tick_size},{n_hist}          — header (envoyé au connect, avant H*)
//   H,{ts_ns},{price},{qty},{0|1}            — tick historique (0=Buy, 1=Sell)
//   E                                        — fin d'historique
//   L,{ts_ns},{price},{qty},{0|1},{seq}      — tick live
//   D,{ts_ns},{0|1},{0|1},{price},{vol}      — DOM update (side 0=bid/1=ask, op 0=upsert/1=delete)
//   P                                        — heartbeat
//
// L'historique est construit directement depuis HistoricalData au moment où un
// client se connecte (BuildHistorySnapshot). OnUpdate n'est plus utilisé pour
// l'historique — évite le problème UpdateReason.HistoricalBar vs NewBar.
//
// Installation :
//   1. Compiler : dotnet build --configuration Release dans C:\tmp\QtTest\
//   2. Copier QuantowerOrderflowBridge.dll dans :
//      C:\Quantower\TradingPlatform\v1.145.17\bin\Scripts\Indicators\Custom\
//   3. Redémarrer Quantower → l'indicateur apparaît dans la liste
//   4. Ajouter sur UN SEUL chart (port unique 7273)

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using TradingPlatform.BusinessLayer;
using TradingPlatform.BusinessLayer.Integration;

public class QuantowerOrderflowBridge : Indicator
{
    [InputParameter("Port", 0, 1024, 65535, 1, 0)]
    public int Port = 7273;

    private static readonly CultureInfo IC = CultureInfo.InvariantCulture;
    private static readonly DateTime UNIX_EPOCH =
        new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    // ── TCP server ────────────────────────────────────────────────────
    private TcpListener   _listener;
    private TcpClient     _client;
    private NetworkStream _stream;
    private Thread        _acceptThread;
    private Thread        _heartbeatThread;
    private Thread        _histLoaderThread;
    private volatile bool _running;
    private volatile bool _histReady;      // replay chart terminé
    private volatile int  _lastHistTick;   // TickCount au dernier HistoricalBar
    private volatile bool _tickHistReady;  // GetHistory() tick terminé (ou échoué)
    private List<string>  _tickHistLines;  // résultat du GetHistory, écrit une seule fois
    private int           _seq;
    private readonly object _writeLock = new object();

    // ──────────────────────────────────────────────────────────────────
    public QuantowerOrderflowBridge() : base()
    {
        Name = "QuantowerOrderflowBridge";
        SeparateWindow = false;
        AddLineSeries("Bridge", Color.Transparent, 1, LineStyle.Solid);
    }

    protected override void OnInit()
    {
        _running = true;
        if (Symbol != null)
        {
            Symbol.NewLast   += HandleNewLast;
            Symbol.NewLevel2 += HandleNewLevel2;
        }
        StartServer();
    }

    protected override void OnUpdate(UpdateArgs args)
    {
        if (args.Reason == UpdateReason.HistoricalBar)
        {
            // Horodater chaque barre historique — la fin du replay = silence >2s
            _lastHistTick = Environment.TickCount;
        }
        else if (!_histReady)
        {
            // Premier update live : replay définitivement terminé
            _histReady = true;
        }
    }

    private void HandleNewLast(Symbol symbol, Last last)
    {
        if (last == null) return;
        int side = last.AggressorFlag == AggressorFlag.Buy ? 0 : 1;
        long tsNs = ToNs(DateTime.UtcNow);
        double price = last.Price;
        long qty = (long)last.Size;
        if (qty <= 0) return;
        SendLine(string.Format(IC, "L,{0},{1:F8},{2},{3},{4}",
            tsNs, price, qty, side, NextSeq()));
    }

    private void HandleNewLevel2(Symbol symbol, Level2Quote quote, DOMQuote dom)
    {
        if (quote == null) return;
        int side  = quote.PriceType == QuotePriceType.Bid ? 0 : 1;
        long vol  = (long)quote.Size;
        int op    = quote.Closed ? 1 : 0;
        long tsNs = ToNs(DateTime.UtcNow);
        double price = quote.Price;
        SendLine(string.Format(IC, "D,{0},{1},{2},{3:F8},{4}",
            tsNs, side, op, price, vol));
    }

    protected override void OnClear()
    {
        _running = false;
        if (Symbol != null)
        {
            Symbol.NewLast   -= HandleNewLast;
            Symbol.NewLevel2 -= HandleNewLevel2;
        }
        StopServer();
    }

        // ──────────────────────────────────────────────────────────────────
        private void StartServer()
        {
            try
            {
                _listener = new TcpListener(IPAddress.Loopback, Port);
                _listener.Start();

                _acceptThread = new Thread(AcceptLoop)
                    { IsBackground = true, Name = "QT-Bridge-Accept" };
                _heartbeatThread = new Thread(HeartbeatLoop)
                    { IsBackground = true, Name = "QT-Bridge-Heartbeat" };
                _histLoaderThread = new Thread(HistoryLoaderThread)
                    { IsBackground = true, Name = "QT-Bridge-History" };

                _acceptThread.Start();
                _heartbeatThread.Start();
                _histLoaderThread.Start();

                Core.Instance.Loggers.Log($"QuantowerOrderflowBridge v3: listening on 127.0.0.1:{Port}",
                    LoggingLevel.Trading, "QT-Bridge");
            }
            catch (Exception ex)
            {
                Core.Instance.Loggers.Log($"QuantowerOrderflowBridge: start failed — {ex.Message}",
                    LoggingLevel.Error, "QT-Bridge");
            }
        }

        private void StopServer()
        {
            try { _client?.Close();  } catch { }
            try { _listener?.Stop(); } catch { }
            _client   = null;
            _stream   = null;
            _listener = null;
        }

        private void AcceptLoop()
        {
            while (_running)
            {
                // AcceptTcpClient est isolé : quand OnClear() appelle _listener.Stop(),
                // il lève une SocketException ici — on doit la catcher sans condition.
                TcpClient client;
                try
                {
                    client = _listener.AcceptTcpClient();
                }
                catch (Exception)
                {
                    break; // listener stoppé (OnClear) ou erreur fatale → sortie propre
                }

                if (!_running)
                {
                    try { client.Close(); } catch { }
                    break;
                }

                client.NoDelay = true;

                // Attendre que HistoryLoaderThread ait fini GetHistory() (max 180s).
                // Le chargement tick est bloquant et peut prendre du temps.
                int waited = 0;
                while (!_tickHistReady && waited < 180000 && _running)
                {
                    Thread.Sleep(500);
                    waited += 500;
                }

                if (!_running)
                {
                    try { client.Close(); } catch { }
                    break;
                }

                if (!_tickHistReady)
                    Core.Instance.Loggers.Log("QuantowerOrderflowBridge: timeout GetHistory()",
                        LoggingLevel.Error, "QT-Bridge");

                try
                {
                    double tickSize = Symbol?.TickSize ?? 0.25;
                    if (tickSize <= 0) tickSize = 0.25;
                    string symName = Symbol?.Name ?? "UNKNOWN";

                    var histBars = _tickHistLines ?? new List<string>();

                    lock (_writeLock)
                    {
                        _client?.Close();
                        _client = client;
                        _stream = client.GetStream();

                        SendBytes(string.Format(IC, "M,{0},{1:F8},{2}",
                            symName, tickSize, histBars.Count));

                        foreach (var line in histBars)
                            SendBytes(line);

                        SendBytes("E");
                    }

                    Core.Instance.Loggers.Log(
                        $"QuantowerOrderflowBridge: client connected — {histBars.Count} hist bars sent → live",
                        LoggingLevel.Trading, "QT-Bridge");
                }
                catch (Exception ex)
                {
                    Core.Instance.Loggers.Log($"QuantowerOrderflowBridge: connect handler error — {ex.Message}",
                        LoggingLevel.Error, "QT-Bridge");
                }
            }
        }

        private void HistoryLoaderThread()
        {
            try
            {
                // Attendre la fin du replay chart avant de faire GetHistory()
                // (le symbol doit être souscrit et prêt).
                int waited = 0;
                while (!_histReady && waited < 60000 && _running)
                {
                    Thread.Sleep(200);
                    waited += 200;
                    int last = _lastHistTick;
                    if (last != 0 && (Environment.TickCount - last) > 2000)
                    {
                        _histReady = true;
                        break;
                    }
                }

                if (!_running) { _tickHistReady = true; return; }

                _tickHistLines = BuildHistorySnapshot();
            }
            catch (Exception ex)
            {
                Core.Instance.Loggers.Log($"QuantowerOrderflowBridge: HistoryLoaderThread — {ex.Message}",
                    LoggingLevel.Error, "QT-Bridge");
                _tickHistLines = new List<string>();
            }
            finally
            {
                _tickHistReady = true;
            }
        }

        private List<string> BuildHistorySnapshot()
        {
            var result = new List<string>(100000);
            try
            {
                if (Symbol == null) return result;

                var cutoff = GetSessionCutoff();

                // Demande l'historique tick-by-tick directement au Symbol —
                // indépendant du chart (fonctionne sur M1, 5m, Daily, etc.)
                var req = new HistoryRequestParameters
                {
                    Symbol      = this.Symbol,
                    FromTime    = cutoff,
                    ToTime      = DateTime.UtcNow,
                    Aggregation = new HistoryAggregationTick(HistoryType.Last)
                };
                var tickHistory = this.Symbol.GetHistory(req);

                if (tickHistory == null)
                {
                    Core.Instance.Loggers.Log("QuantowerOrderflowBridge: GetHistory returned null",
                        LoggingLevel.Error, "QT-Bridge");
                    return result;
                }

                int count = tickHistory.Count;
                double prevPrice = double.NaN;
                int    prevSide  = 0;
                long   seq       = 1;

                for (int i = 0; i < count; i++)
                {
                    var tick = tickHistory[i, SeekOriginHistory.Begin];
                    if (tick == null) continue;

                    var tsUtc = tick.TimeLeft.Kind == DateTimeKind.Utc
                        ? tick.TimeLeft
                        : tick.TimeLeft.ToUniversalTime();

                    double price = tick[PriceType.Last];
                    long qty = (long)tick[PriceType.Volume];
                    if (qty <= 0 || price <= 0) continue;

                    // AggressorFlag : None=0, Buy=1, Sell=2, NotSet=3
                    int aggressor = (int)tick[PriceType.AggressorFlag];
                    int side;
                    if (aggressor == 1)
                    {
                        side = 0;
                        prevPrice = price; prevSide = 0;
                    }
                    else if (aggressor == 2)
                    {
                        side = 1;
                        prevPrice = price; prevSide = 1;
                    }
                    else
                    {
                        if (double.IsNaN(prevPrice)) side = 0;
                        else if (price > prevPrice)  side = 0;
                        else if (price < prevPrice)  side = 1;
                        else                         side = prevSide;
                        prevPrice = price; prevSide = side;
                    }

                    result.Add(string.Format(IC, "H,{0},{1:F8},{2},{3},{4}",
                        ToNs(tsUtc), price, qty, side, seq++));
                }

                Core.Instance.Loggers.Log(
                    $"QuantowerOrderflowBridge: tick history — {count} ticks, {result.Count} envoyés (session du jour)",
                    LoggingLevel.Trading, "QT-Bridge");
            }
            catch (Exception ex)
            {
                Core.Instance.Loggers.Log($"QuantowerOrderflowBridge: history build error — {ex.Message}",
                    LoggingLevel.Error, "QT-Bridge");
            }
            return result;
        }

        private void HeartbeatLoop()
        {
            while (_running)
            {
                Thread.Sleep(5000);
                SendLine("P");
            }
        }

        private void SendLine(string line)
        {
            lock (_writeLock) { SendBytes(line); }
        }

        private void SendBytes(string line)
        {
            if (_stream == null) return;
            try
            {
                byte[] data = Encoding.UTF8.GetBytes(line + "\n");
                _stream.Write(data, 0, data.Length);
            }
            catch
            {
                _client?.Close();
                _client = null;
                _stream = null;
            }
        }

        private int NextSeq() =>
            System.Threading.Interlocked.Increment(ref _seq);

        private static long ToNs(DateTime utcTime) =>
            (long)(utcTime - UNIX_EPOCH).TotalMilliseconds * 1_000_000L;

        // CME Globex: session opens 17:00 CT = 22:00 UTC (CDT) / 23:00 UTC (CST).
        // Using 22:00 UTC covers the full session in all scenarios — at worst
        // includes 1 extra hour in winter (CST), which is negligible.
        private static DateTime GetSessionCutoff()
        {
            var utcNow   = DateTime.UtcNow;
            var candidate = utcNow.Date.AddHours(22); // today 22:00 UTC
            if (candidate > utcNow)
                candidate = candidate.AddDays(-1);    // yesterday 22:00 UTC
            return candidate;
        }
    }
