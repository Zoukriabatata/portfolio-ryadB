import {
  CryptoIcon,
  StocksIcon,
  FuturesIcon,
  ForexIcon,
  IndicesIcon,
  OptionsIcon,
} from '@/components/ui/Icons';

export type AssetCategory = 'crypto' | 'stocks' | 'futures' | 'forex' | 'indices' | 'options';

export const ASSET_CATEGORY_ICONS: Record<AssetCategory, React.FC<{ size?: number; color?: string }>> = {
  crypto: CryptoIcon,
  stocks: StocksIcon,
  futures: FuturesIcon,
  forex: ForexIcon,
  indices: IndicesIcon,
  options: OptionsIcon,
};

export const ASSET_CATEGORIES: { id: AssetCategory; label: string }[] = [
  { id: 'crypto', label: 'Crypto' },
  { id: 'futures', label: 'Futures' },
  { id: 'options', label: 'Options' },
];

export const SYMBOL_CATEGORIES_BY_ASSET: Record<AssetCategory, Record<string, { value: string; label: string; exchange?: string }[]>> = {
  crypto: {
    'Major': [
      { value: 'btcusdt', label: 'BTC/USDT' },
      { value: 'ethusdt', label: 'ETH/USDT' },
      { value: 'bnbusdt', label: 'BNB/USDT' },
      { value: 'solusdt', label: 'SOL/USDT' },
      { value: 'xrpusdt', label: 'XRP/USDT' },
      { value: 'adausdt', label: 'ADA/USDT' },
      { value: 'dogeusdt', label: 'DOGE/USDT' },
      { value: 'avaxusdt', label: 'AVAX/USDT' },
    ],
    'DeFi': [
      { value: 'linkusdt', label: 'LINK/USDT' },
      { value: 'uniusdt', label: 'UNI/USDT' },
      { value: 'aaveusdt', label: 'AAVE/USDT' },
      { value: 'mkrusdt', label: 'MKR/USDT' },
    ],
    'Layer 2': [
      { value: 'arbusdt', label: 'ARB/USDT' },
      { value: 'opusdt', label: 'OP/USDT' },
      { value: 'maticusdt', label: 'MATIC/USDT' },
    ],
    'Meme': [
      { value: 'shibusdt', label: 'SHIB/USDT' },
      { value: 'pepeusdt', label: 'PEPE/USDT' },
      { value: 'dogeusdt', label: 'DOGE/USDT' },
    ],
  },
  stocks: {
    'Tech': [
      { value: 'AAPL', label: 'Apple', exchange: 'NASDAQ' },
      { value: 'MSFT', label: 'Microsoft', exchange: 'NASDAQ' },
      { value: 'GOOGL', label: 'Alphabet', exchange: 'NASDAQ' },
      { value: 'AMZN', label: 'Amazon', exchange: 'NASDAQ' },
      { value: 'NVDA', label: 'NVIDIA', exchange: 'NASDAQ' },
      { value: 'META', label: 'Meta', exchange: 'NASDAQ' },
      { value: 'TSLA', label: 'Tesla', exchange: 'NASDAQ' },
    ],
    'Finance': [
      { value: 'JPM', label: 'JPMorgan', exchange: 'NYSE' },
      { value: 'BAC', label: 'Bank of America', exchange: 'NYSE' },
      { value: 'GS', label: 'Goldman Sachs', exchange: 'NYSE' },
      { value: 'V', label: 'Visa', exchange: 'NYSE' },
    ],
    'Healthcare': [
      { value: 'JNJ', label: 'Johnson & Johnson', exchange: 'NYSE' },
      { value: 'UNH', label: 'UnitedHealth', exchange: 'NYSE' },
      { value: 'PFE', label: 'Pfizer', exchange: 'NYSE' },
    ],
  },
  futures: {
    'Index Futures': [
      { value: 'ES',  label: 'E-mini S&P 500',    exchange: 'CME'  },
      { value: 'MES', label: 'Micro S&P 500',      exchange: 'CME'  },
      { value: 'NQ',  label: 'E-mini Nasdaq 100',  exchange: 'CME'  },
      { value: 'MNQ', label: 'Micro Nasdaq 100',   exchange: 'CME'  },
      { value: 'YM',  label: 'E-mini Dow Jones',   exchange: 'CBOT' },
      { value: 'MYM', label: 'Micro Dow Jones',    exchange: 'CBOT' },
      { value: 'RTY', label: 'E-mini Russell 2000',exchange: 'CME'  },
      { value: 'M2K', label: 'Micro Russell 2000', exchange: 'CME'  },
    ],
    'Energy': [
      { value: 'CL',  label: 'Crude Oil WTI',  exchange: 'NYMEX' },
      { value: 'QM',  label: 'Mini Crude Oil', exchange: 'NYMEX' },
      { value: 'MCL', label: 'Micro Crude Oil',exchange: 'NYMEX' },
      { value: 'NG',  label: 'Natural Gas',    exchange: 'NYMEX' },
    ],
    'Metals': [
      { value: 'GC',  label: 'Gold',         exchange: 'COMEX' },
      { value: 'MGC', label: 'Micro Gold',   exchange: 'COMEX' },
      { value: 'SI',  label: 'Silver',       exchange: 'COMEX' },
      { value: 'SIL', label: 'Micro Silver', exchange: 'COMEX' },
      { value: 'HG',  label: 'Copper',       exchange: 'COMEX' },
      { value: 'PL',  label: 'Platinum',     exchange: 'NYMEX' },
    ],
    'Rates': [
      { value: 'ZB', label: '30Y T-Bond', exchange: 'CBOT' },
      { value: 'ZN', label: '10Y T-Note', exchange: 'CBOT' },
      { value: 'ZF', label: '5Y T-Note',  exchange: 'CBOT' },
      { value: 'ZT', label: '2Y T-Note',  exchange: 'CBOT' },
    ],
    'FX Futures': [
      { value: '6E', label: 'EUR/USD', exchange: 'CME' },
      { value: '6J', label: 'JPY',     exchange: 'CME' },
      { value: '6B', label: 'GBP',     exchange: 'CME' },
      { value: '6A', label: 'AUD',     exchange: 'CME' },
      { value: '6C', label: 'CAD',     exchange: 'CME' },
      { value: '6S', label: 'CHF',     exchange: 'CME' },
    ],
  },
  forex: {
    'Majors': [
      { value: 'EURUSD', label: 'EUR/USD' },
      { value: 'GBPUSD', label: 'GBP/USD' },
      { value: 'USDJPY', label: 'USD/JPY' },
      { value: 'USDCHF', label: 'USD/CHF' },
      { value: 'AUDUSD', label: 'AUD/USD' },
      { value: 'USDCAD', label: 'USD/CAD' },
    ],
    'Crosses': [
      { value: 'EURGBP', label: 'EUR/GBP' },
      { value: 'EURJPY', label: 'EUR/JPY' },
      { value: 'GBPJPY', label: 'GBP/JPY' },
      { value: 'AUDJPY', label: 'AUD/JPY' },
    ],
    'Exotics': [
      { value: 'USDMXN', label: 'USD/MXN' },
      { value: 'USDZAR', label: 'USD/ZAR' },
      { value: 'USDTRY', label: 'USD/TRY' },
    ],
  },
  indices: {
    'US Indices': [
      { value: 'SPX', label: 'S&P 500' },
      { value: 'NDX', label: 'Nasdaq 100' },
      { value: 'DJI', label: 'Dow Jones' },
      { value: 'RUT', label: 'Russell 2000' },
      { value: 'VIX', label: 'VIX' },
    ],
    'European': [
      { value: 'DAX', label: 'DAX 40' },
      { value: 'FTSE', label: 'FTSE 100' },
      { value: 'CAC', label: 'CAC 40' },
    ],
    'Asian': [
      { value: 'NI225', label: 'Nikkei 225' },
      { value: 'HSI', label: 'Hang Seng' },
      { value: 'SSEC', label: 'Shanghai' },
    ],
  },
  options: {
    'Index Options': [
      { value: 'SPY', label: 'SPY Options' },
      { value: 'QQQ', label: 'QQQ Options' },
      { value: 'IWM', label: 'IWM Options' },
      { value: 'DIA', label: 'DIA Options' },
    ],
    'Stock Options': [
      { value: 'AAPL_OPT', label: 'AAPL Options' },
      { value: 'TSLA_OPT', label: 'TSLA Options' },
      { value: 'NVDA_OPT', label: 'NVDA Options' },
      { value: 'AMD_OPT', label: 'AMD Options' },
    ],
    'Volatility': [
      { value: 'UVXY', label: 'UVXY' },
      { value: 'SVXY', label: 'SVXY' },
      { value: 'VXX', label: 'VXX' },
    ],
  },
};
