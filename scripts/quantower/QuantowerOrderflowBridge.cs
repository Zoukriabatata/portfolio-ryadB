// QuantowerOrderflowBridge.cs
// Streams ticks + DOM from Quantower to the Orderflow-v2 desktop app
// via a local TCP connection on port 7273.
//
// Wire protocol (UTF-8, newline-terminated, identical to NinjaTrader bridge):
//   M,{seq},{symbol},{price},{qty},{B|S}\n   — tick trade
//   D,{seq},{symbol},{B|S},{price},{qty}\n   — DOM update
//   H,{seq}\n                               — heartbeat (1 s)
//   E,{seq}\n                               — end of history sentinel
//
// Installation:
//   1. Copy this file to %QUANTOWER_DIR%\Scripts\Indicators\
//   2. Quantower → Tools → Scripts → Compile
//   3. Add the indicator to a chart with a Rithmic feed
//   4. In Orderflow-v2: switch source to Quantower → Connect

using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using TradingPlatform.BusinessLayer;

namespace OrderflowV2
{
    [Indicator("QuantowerOrderflowBridge", "Senzoukria Orderflow Bridge", Version = "1.0",
               Description = "Streams ticks + DOM to Orderflow-v2 desktop on localhost:7273")]
    public class QuantowerOrderflowBridge : Indicator
    {
        [InputParameter("Port", 0, 1024, 65535, 1, 0)]
        public int Port = 7273;

        private TcpListener   _listener;
        private TcpClient     _client;
        private NetworkStream _stream;
        private Thread        _acceptThread;
        private Thread        _heartbeatThread;
        private int           _seq;
        private volatile bool _running;
        private readonly object _writeLock = new object();

        // ──────────────────────────────────────────────────────────────
        protected override void OnInit()
        {
            Name = "QuantowerOrderflowBridge";
            _running = true;
            StartServer();
        }

        protected override void OnUpdate(UpdateArgs args) { /* not used */ }

        // Called for every trade print on the subscribed symbol.
        protected override void OnTrade(Trade trade)
        {
            if (trade == null) return;
            string side = trade.AggressorFlag == AggressorFlag.Buy ? "B" : "S";
            SendLine(
                $"M,{NextSeq()},{Symbol.Name}," +
                $"{trade.Price.ToString(System.Globalization.CultureInfo.InvariantCulture)}," +
                $"{(long)trade.Size},{side}"
            );
        }

        // Called for every DOM update on the subscribed symbol.
        protected override void OnLevel2(Level2Quote quote)
        {
            if (quote == null) return;
            string side = quote.Side == Side.Buy ? "B" : "S";
            SendLine(
                $"D,{NextSeq()},{Symbol.Name},{side}," +
                $"{quote.Price.ToString(System.Globalization.CultureInfo.InvariantCulture)}," +
                $"{(long)quote.Size}"
            );
        }

        protected override void OnStop()
        {
            _running = false;
            StopServer();
        }

        // ──────────────────────────────────────────────────────────────
        private void StartServer()
        {
            try
            {
                _listener = new TcpListener(IPAddress.Loopback, Port);
                _listener.Start();

                _acceptThread = new Thread(AcceptLoop) { IsBackground = true };
                _acceptThread.Start();

                _heartbeatThread = new Thread(HeartbeatLoop) { IsBackground = true };
                _heartbeatThread.Start();

                Log($"QuantowerOrderflowBridge: listening on 127.0.0.1:{Port}", StrategyLoggingLevel.Trading);
            }
            catch (Exception ex)
            {
                Log($"QuantowerOrderflowBridge: start failed — {ex.Message}", StrategyLoggingLevel.Error);
            }
        }

        private void StopServer()
        {
            try { _client?.Close();  } catch { /* ignore */ }
            try { _listener?.Stop(); } catch { /* ignore */ }
            _client   = null;
            _stream   = null;
            _listener = null;
        }

        private void AcceptLoop()
        {
            while (_running)
            {
                try
                {
                    var client = _listener.AcceptTcpClient();
                    lock (_writeLock)
                    {
                        _client?.Close();
                        _client = client;
                        _stream = client.GetStream();
                    }
                    Log("QuantowerOrderflowBridge: client connected", StrategyLoggingLevel.Trading);
                    // Send end-of-history sentinel immediately — we don't
                    // replay historical bars; the app requests them via
                    // rithmic_get_bars from its own SQLite cache.
                    SendLine($"E,{NextSeq()}");
                }
                catch (Exception ex) when (_running)
                {
                    Log($"QuantowerOrderflowBridge: accept error — {ex.Message}", StrategyLoggingLevel.Error);
                    Thread.Sleep(1000);
                }
            }
        }

        private void HeartbeatLoop()
        {
            while (_running)
            {
                Thread.Sleep(1000);
                SendLine($"H,{NextSeq()}");
            }
        }

        private void SendLine(string line)
        {
            lock (_writeLock)
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
        }

        private int NextSeq() => Interlocked.Increment(ref _seq);
    }
}
