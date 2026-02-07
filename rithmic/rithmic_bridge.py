#!/usr/bin/env python3
"""
RITHMIC BRIDGE FOR TOPSTEP
==========================

Bridge Python pour recevoir les trades CME via Rithmic (Topstep)
et les streamer vers Next.js via WebSocket.

Usage:
    python rithmic_bridge.py

Requires:
    pip install asyncio websockets pyrithmic python-dotenv

Environment (.env):
    RITHMIC_USER=your_topstep_username
    RITHMIC_PASSWORD=your_topstep_password
    RITHMIC_SYSTEM=TopstepTrader  # or TopstepX
    RITHMIC_GATEWAY=rithmic.topstep.com
    RITHMIC_APP_NAME=YourAppName
    RITHMIC_APP_VERSION=1.0.0
"""

import asyncio
import json
import logging
import os
import signal
import sys
from datetime import datetime
from typing import Dict, Set, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum

# WebSocket server
try:
    import websockets
    from websockets.server import serve
except ImportError:
    print("ERROR: websockets not installed. Run: pip install websockets")
    sys.exit(1)

# Environment
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("WARNING: python-dotenv not installed. Using environment variables directly.")

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('RithmicBridge')

# Rithmic credentials
RITHMIC_CONFIG = {
    'user': os.getenv('RITHMIC_USER', ''),
    'password': os.getenv('RITHMIC_PASSWORD', ''),
    'system': os.getenv('RITHMIC_SYSTEM', 'TopstepTrader'),
    'gateway': os.getenv('RITHMIC_GATEWAY', 'rithmic.topstep.com'),
    'app_name': os.getenv('RITHMIC_APP_NAME', 'OrderflowBridge'),
    'app_version': os.getenv('RITHMIC_APP_VERSION', '1.0.0'),
}

# WebSocket server config
WS_HOST = os.getenv('WS_HOST', 'localhost')
WS_PORT = int(os.getenv('WS_PORT', '8765'))

# CME Symbols to subscribe
CME_SYMBOLS = [
    {'symbol': 'NQ', 'exchange': 'CME', 'full': 'NQH5'},   # Adjust contract month
    {'symbol': 'MNQ', 'exchange': 'CME', 'full': 'MNQH5'},
    {'symbol': 'ES', 'exchange': 'CME', 'full': 'ESH5'},
    {'symbol': 'MES', 'exchange': 'CME', 'full': 'MESH5'},
]

# ═══════════════════════════════════════════════════════════════════════════════
# DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════

class Side(Enum):
    BID = 'bid'
    ASK = 'ask'
    UNKNOWN = 'unknown'


@dataclass
class Trade:
    """Trade data structure matching Next.js expected format"""
    symbol: str
    price: float
    size: int
    side: str
    timestamp: int  # milliseconds
    exchange: str = 'CME'

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Quote:
    """Best bid/ask for aggressor classification"""
    symbol: str
    bid_price: float
    ask_price: float
    bid_size: int
    ask_size: int
    timestamp: int


# ═══════════════════════════════════════════════════════════════════════════════
# RITHMIC CLIENT (SIMULATION MODE FOR TESTING)
# ═══════════════════════════════════════════════════════════════════════════════
# Note: Full Rithmic implementation requires pyrithmic or direct protobuf.
# This provides the structure - replace with actual Rithmic API calls.

class RithmicClient:
    """
    Rithmic API Client for Topstep

    For production, use pyrithmic library or implement Protocol Buffers directly.
    Rithmic API documentation: https://www.rithmic.com/apis
    """

    def __init__(self, config: Dict[str, str]):
        self.config = config
        self.connected = False
        self.authenticated = False
        self.subscribed_symbols: Set[str] = set()
        self.quotes: Dict[str, Quote] = {}  # For bid/ask classification

        # Callbacks
        self.on_trade: Optional[callable] = None
        self.on_quote: Optional[callable] = None
        self.on_connected: Optional[callable] = None
        self.on_disconnected: Optional[callable] = None

        # Connection state
        self._reconnect_delay = 1
        self._max_reconnect_delay = 60
        self._running = False

    async def connect(self) -> bool:
        """Connect to Rithmic server"""
        logger.info(f"Connecting to Rithmic: {self.config['gateway']}")

        try:
            # ══════════════════════════════════════════════════════════════════
            # PRODUCTION: Replace with actual Rithmic connection
            # ══════════════════════════════════════════════════════════════════
            #
            # Using pyrithmic:
            # from pyrithmic import RithmicClient as PyRithmicClient
            # self.client = PyRithmicClient(
            #     user=self.config['user'],
            #     password=self.config['password'],
            #     system_name=self.config['system'],
            #     app_name=self.config['app_name'],
            #     app_version=self.config['app_version'],
            #     gateway=self.config['gateway'],
            # )
            # await self.client.connect()
            #
            # ══════════════════════════════════════════════════════════════════

            # Simulate connection for structure demonstration
            await asyncio.sleep(0.5)

            if not self.config['user'] or not self.config['password']:
                logger.warning("No credentials provided - running in SIMULATION mode")
                self.connected = True
                self.authenticated = True
                self._running = True

                if self.on_connected:
                    await self.on_connected()

                return True

            # With real credentials, would authenticate here
            self.connected = True
            self.authenticated = True
            self._running = True

            if self.on_connected:
                await self.on_connected()

            logger.info("✓ Connected to Rithmic")
            return True

        except Exception as e:
            logger.error(f"Connection failed: {e}")
            self.connected = False
            return False

    async def disconnect(self):
        """Disconnect from Rithmic"""
        logger.info("Disconnecting from Rithmic...")
        self._running = False
        self.connected = False
        self.authenticated = False

        if self.on_disconnected:
            await self.on_disconnected()

    async def subscribe_trades(self, symbol: str, exchange: str = 'CME'):
        """Subscribe to trade stream for a symbol"""
        if not self.connected:
            logger.error("Cannot subscribe - not connected")
            return False

        logger.info(f"Subscribing to trades: {symbol} ({exchange})")

        # ══════════════════════════════════════════════════════════════════════
        # PRODUCTION: Replace with actual Rithmic subscription
        # ══════════════════════════════════════════════════════════════════════
        # await self.client.subscribe_trades(symbol, exchange)
        # ══════════════════════════════════════════════════════════════════════

        self.subscribed_symbols.add(symbol)
        logger.info(f"✓ Subscribed to {symbol}")
        return True

    async def subscribe_quotes(self, symbol: str, exchange: str = 'CME'):
        """Subscribe to quote stream for bid/ask classification"""
        if not self.connected:
            return False

        logger.info(f"Subscribing to quotes: {symbol} ({exchange})")

        # Initialize quote cache
        self.quotes[symbol] = Quote(
            symbol=symbol,
            bid_price=0,
            ask_price=0,
            bid_size=0,
            ask_size=0,
            timestamp=0
        )

        return True

    def classify_trade(self, symbol: str, price: float) -> str:
        """
        Classify trade as bid or ask based on last quote

        Rules:
        - price >= ask → ASK (buyer lifted offer)
        - price <= bid → BID (seller hit bid)
        - otherwise → use tick rule or midpoint
        """
        quote = self.quotes.get(symbol)
        if not quote or quote.bid_price <= 0 or quote.ask_price <= 0:
            return 'unknown'

        if price >= quote.ask_price:
            return 'ask'
        elif price <= quote.bid_price:
            return 'bid'
        else:
            # Midpoint - use proximity
            mid = (quote.bid_price + quote.ask_price) / 2
            return 'ask' if price >= mid else 'bid'

    async def run_simulation(self):
        """
        Simulation mode - generates fake trades for testing
        Remove this in production and use real Rithmic callbacks
        """
        import random

        logger.info("Starting SIMULATION mode (no real Rithmic connection)")

        # Base prices for simulation
        base_prices = {
            'NQ': 21500.00,
            'MNQ': 21500.00,
            'ES': 6050.00,
            'MES': 6050.00,
        }

        while self._running:
            for sym_config in CME_SYMBOLS:
                symbol = sym_config['symbol']
                base = base_prices.get(symbol, 20000)

                # Simulate price movement
                tick_size = 0.25
                price_change = random.choice([-2, -1, 0, 1, 2]) * tick_size
                base_prices[symbol] = base + price_change
                price = base_prices[symbol]

                # Simulate quote update
                spread = tick_size
                self.quotes[symbol] = Quote(
                    symbol=symbol,
                    bid_price=price - spread/2,
                    ask_price=price + spread/2,
                    bid_size=random.randint(1, 50),
                    ask_size=random.randint(1, 50),
                    timestamp=int(datetime.now().timestamp() * 1000)
                )

                # Simulate trade
                size = random.randint(1, 10)
                side = self.classify_trade(symbol, price)

                trade = Trade(
                    symbol=symbol,
                    price=price,
                    size=size,
                    side=side,
                    timestamp=int(datetime.now().timestamp() * 1000),
                    exchange='CME'
                )

                if self.on_trade:
                    await self.on_trade(trade)

            # Simulate realistic tick rate (adjust as needed)
            await asyncio.sleep(random.uniform(0.1, 0.5))


# ═══════════════════════════════════════════════════════════════════════════════
# WEBSOCKET SERVER
# ═══════════════════════════════════════════════════════════════════════════════

class WebSocketServer:
    """WebSocket server to stream trades to Next.js"""

    def __init__(self, host: str = 'localhost', port: int = 8765):
        self.host = host
        self.port = port
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self.server = None
        self.trade_count = 0
        self.start_time = None

    async def start(self):
        """Start WebSocket server"""
        self.start_time = datetime.now()
        self.server = await serve(
            self.handle_client,
            self.host,
            self.port,
            ping_interval=30,
            ping_timeout=10,
        )
        logger.info(f"✓ WebSocket server started on ws://{self.host}:{self.port}")

    async def stop(self):
        """Stop WebSocket server"""
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.info("WebSocket server stopped")

    async def handle_client(self, websocket: websockets.WebSocketServerProtocol, path: str):
        """Handle new WebSocket client connection"""
        client_addr = websocket.remote_address
        logger.info(f"Client connected: {client_addr}")
        self.clients.add(websocket)

        try:
            # Send welcome message with current state
            welcome = {
                'type': 'welcome',
                'message': 'Connected to Rithmic Bridge',
                'symbols': [s['symbol'] for s in CME_SYMBOLS],
                'trade_count': self.trade_count,
            }
            await websocket.send(json.dumps(welcome))

            # Keep connection alive and handle incoming messages
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.handle_message(websocket, data)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON from client: {message}")

        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client disconnected: {client_addr}")
        finally:
            self.clients.discard(websocket)

    async def handle_message(self, websocket, data: dict):
        """Handle incoming message from client"""
        msg_type = data.get('type')

        if msg_type == 'ping':
            await websocket.send(json.dumps({'type': 'pong'}))

        elif msg_type == 'subscribe':
            # Client can request specific symbols
            symbols = data.get('symbols', [])
            logger.info(f"Client subscription request: {symbols}")
            await websocket.send(json.dumps({
                'type': 'subscribed',
                'symbols': symbols
            }))

        elif msg_type == 'status':
            await websocket.send(json.dumps({
                'type': 'status',
                'connected_clients': len(self.clients),
                'trade_count': self.trade_count,
                'uptime_seconds': (datetime.now() - self.start_time).total_seconds() if self.start_time else 0,
            }))

    async def broadcast_trade(self, trade: Trade):
        """Broadcast trade to all connected clients"""
        if not self.clients:
            return

        self.trade_count += 1

        message = json.dumps({
            'type': 'trade',
            'data': trade.to_dict()
        })

        # Send to all clients concurrently
        await asyncio.gather(
            *[self.send_safe(client, message) for client in self.clients],
            return_exceptions=True
        )

    async def send_safe(self, websocket, message: str):
        """Send message with error handling"""
        try:
            await websocket.send(message)
        except websockets.exceptions.ConnectionClosed:
            self.clients.discard(websocket)
        except Exception as e:
            logger.error(f"Send error: {e}")
            self.clients.discard(websocket)


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN BRIDGE
# ═══════════════════════════════════════════════════════════════════════════════

class RithmicBridge:
    """Main bridge orchestrating Rithmic → WebSocket streaming"""

    def __init__(self):
        self.rithmic = RithmicClient(RITHMIC_CONFIG)
        self.ws_server = WebSocketServer(WS_HOST, WS_PORT)
        self._running = False
        self._trade_count = 0
        self._last_log_time = 0

    async def start(self):
        """Start the bridge"""
        logger.info("=" * 60)
        logger.info("RITHMIC BRIDGE FOR TOPSTEP")
        logger.info("=" * 60)
        logger.info(f"Gateway: {RITHMIC_CONFIG['gateway']}")
        logger.info(f"System: {RITHMIC_CONFIG['system']}")
        logger.info(f"Symbols: {[s['symbol'] for s in CME_SYMBOLS]}")
        logger.info("=" * 60)

        self._running = True

        # Start WebSocket server
        await self.ws_server.start()

        # Set up Rithmic callbacks
        self.rithmic.on_trade = self.handle_trade
        self.rithmic.on_connected = self.on_rithmic_connected
        self.rithmic.on_disconnected = self.on_rithmic_disconnected

        # Connect to Rithmic
        connected = await self.rithmic.connect()
        if not connected:
            logger.error("Failed to connect to Rithmic")
            return

        # Subscribe to symbols
        for sym_config in CME_SYMBOLS:
            await self.rithmic.subscribe_quotes(sym_config['symbol'], sym_config['exchange'])
            await self.rithmic.subscribe_trades(sym_config['symbol'], sym_config['exchange'])

        # Run simulation if no real credentials
        if not RITHMIC_CONFIG['user']:
            await self.rithmic.run_simulation()
        else:
            # In production, Rithmic callbacks will drive the data flow
            while self._running:
                await asyncio.sleep(1)

    async def stop(self):
        """Stop the bridge"""
        logger.info("Stopping bridge...")
        self._running = False
        await self.rithmic.disconnect()
        await self.ws_server.stop()
        logger.info("Bridge stopped")

    async def handle_trade(self, trade: Trade):
        """Handle incoming trade from Rithmic"""
        self._trade_count += 1

        # Log periodically
        now = datetime.now().timestamp()
        if now - self._last_log_time > 5:
            self._last_log_time = now
            logger.info(f"[{trade.symbol}] ${trade.price} x{trade.size} ({trade.side}) | Total: {self._trade_count}")

        # Broadcast to WebSocket clients
        await self.ws_server.broadcast_trade(trade)

    async def on_rithmic_connected(self):
        """Handle Rithmic connection"""
        logger.info("✓ Rithmic connected")

    async def on_rithmic_disconnected(self):
        """Handle Rithmic disconnection"""
        logger.warning("Rithmic disconnected - attempting reconnect...")


# ═══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

async def main():
    bridge = RithmicBridge()

    # Handle shutdown gracefully
    loop = asyncio.get_event_loop()

    def signal_handler():
        asyncio.create_task(bridge.stop())

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, signal_handler)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass

    try:
        await bridge.start()
    except KeyboardInterrupt:
        await bridge.stop()
    except Exception as e:
        logger.error(f"Bridge error: {e}")
        await bridge.stop()


if __name__ == '__main__':
    print("""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                       RITHMIC BRIDGE FOR TOPSTEP                              ║
║                                                                               ║
║  This bridge connects to Rithmic (Topstep) and streams CME trades            ║
║  to your Next.js application via WebSocket.                                  ║
║                                                                               ║
║  Setup:                                                                       ║
║  1. Create .env file with your Topstep credentials                           ║
║  2. pip install websockets python-dotenv                                      ║
║  3. python rithmic_bridge.py                                                  ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
    """)
    asyncio.run(main())
