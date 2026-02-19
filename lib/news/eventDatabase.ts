import type { EventDetail } from '@/types/news';

// ---------------------------------------------------------------------------
// Static knowledge base for all economic events
// Maps event name → detailed information
// ---------------------------------------------------------------------------

export const EVENT_DATABASE: Record<string, EventDetail> = {
  // ==========================================================================
  // USD
  // ==========================================================================
  'Non-Farm Payrolls': {
    description: 'Measures the change in the number of employed people in the US, excluding farm workers, government employees, and private household workers.',
    whyItMatters: 'NFP is the single most market-moving US economic release. It directly influences Federal Reserve policy decisions on interest rates and signals the overall health of the US labor market.',
    affectedPairs: ['EUR/USD', 'USD/JPY', 'GBP/USD', 'BTC/USD'],
    typicalReaction: {
      beat: 'USD strengthens across the board, equities rally on strong employment, yields rise on rate hike expectations.',
      miss: 'USD weakens sharply, safe-haven flows to gold/JPY/CHF, rate cut expectations increase.',
      inline: 'Limited initial move, traders focus on wage growth and revision details.',
    },
    frequency: 'Monthly, first Friday',
    releaseTime: '8:30 AM ET',
    source: 'Bureau of Labor Statistics',
    importance: 'The single most market-moving US data release',
    riskScenarios: {
      bearish: { condition: 'NFP < 150K with rising unemployment', explanation: 'Signals labor market deterioration. Fed likely to cut rates, weakening USD. Risk-off sentiment hits crypto and equities.', severity: 'high' },
      bullish: { condition: 'NFP > 300K with wage growth > 0.4%', explanation: 'Strong employment + rising wages = inflationary pressure. Fed stays hawkish, USD rallies, yields climb.', severity: 'high' },
    },
    keyLevelToWatch: 'Watch 200K as the consensus threshold — above = strong, below = concerning',
  },

  'FOMC Statement': {
    description: 'The Federal Open Market Committee statement on monetary policy, including the federal funds rate decision and forward guidance.',
    whyItMatters: 'The FOMC directly sets US interest rates and provides forward guidance that shapes market expectations for months. Every word is analyzed for hawkish/dovish signals.',
    affectedPairs: ['EUR/USD', 'USD/JPY', 'GBP/USD', 'XAU/USD', 'BTC/USD'],
    typicalReaction: {
      beat: 'Hawkish surprise: USD surges, yields spike, equities dip initially, crypto drops on risk-off.',
      miss: 'Dovish surprise: USD sells off, gold rallies, equities rally on easier financial conditions.',
      inline: 'Market focuses on dot plot changes and press conference tone.',
    },
    frequency: '8 times per year (~6 weeks apart)',
    releaseTime: '2:00 PM ET (press conference 2:30 PM)',
    source: 'Federal Reserve',
    importance: 'Most important central bank event globally',
    riskScenarios: {
      bearish: { condition: 'Unexpected rate hike or hawkish pivot', explanation: 'Higher rates strengthen USD but crush risk assets. Crypto and growth stocks sell off hard. Liquidity tightens.', severity: 'high' },
      bullish: { condition: 'Dovish pivot or rate cut signal', explanation: 'Lower rates weaken USD, boost risk appetite. Crypto, equities, and gold all benefit from easier monetary policy.', severity: 'high' },
    },
    keyLevelToWatch: 'Focus on the dot plot median rate vs. market pricing — any gap triggers volatility',
  },

  'CPI m/m': {
    description: 'Consumer Price Index measures the monthly change in prices paid by consumers for a basket of goods and services.',
    whyItMatters: 'CPI is the primary inflation gauge. It directly drives Fed rate decisions. Higher CPI = tighter policy, lower CPI = potential easing.',
    affectedPairs: ['EUR/USD', 'USD/JPY', 'GBP/USD', 'XAU/USD', 'BTC/USD'],
    typicalReaction: {
      beat: 'Higher inflation = USD strength (rate hike expectations), equities sell off, gold mixed.',
      miss: 'Lower inflation = USD weakness, equities rally on rate cut hopes, gold rallies.',
      inline: 'Minimal reaction, focus shifts to core CPI and year-over-year trend.',
    },
    frequency: 'Monthly, around 10th-15th',
    releaseTime: '8:30 AM ET',
    source: 'Bureau of Labor Statistics',
    importance: 'Top-tier inflation indicator, directly moves Fed policy expectations',
    riskScenarios: {
      bearish: { condition: 'CPI > 0.4% m/m or re-acceleration', explanation: 'Sticky inflation forces Fed to keep rates higher for longer. Risk assets suffer, USD rallies on hawkish repricing.', severity: 'high' },
      bullish: { condition: 'CPI < 0.1% or negative', explanation: 'Disinflation trend confirms Fed can cut. Risk assets rally, USD weakens, BTC benefits from looser conditions.', severity: 'high' },
    },
    keyLevelToWatch: '0.2% m/m is the "goldilocks" — enough to show stable economy without triggering hawkish fears',
  },

  'Core CPI m/m': {
    description: 'Core CPI excludes volatile food and energy prices, giving a cleaner picture of underlying inflation trends.',
    whyItMatters: 'The Fed focuses more on core CPI than headline because it strips out volatile components. A persistent core inflation reading changes rate expectations.',
    affectedPairs: ['EUR/USD', 'USD/JPY', 'BTC/USD'],
    typicalReaction: {
      beat: 'Hawkish repricing — yields surge, USD strengthens, risk assets drop.',
      miss: 'Dovish repricing — risk-on rally, USD weakens, crypto benefits.',
      inline: 'Market moves to headline CPI and detailed breakdown.',
    },
    frequency: 'Monthly, same day as headline CPI',
    releaseTime: '8:30 AM ET',
    source: 'Bureau of Labor Statistics',
    importance: 'Fed\'s preferred inflation gauge — moves markets more than headline',
    riskScenarios: {
      bearish: { condition: 'Core CPI > 0.4% for consecutive months', explanation: 'Signals embedded inflation that monetary policy cannot easily tame. Fed forced into prolonged tightening.', severity: 'high' },
      bullish: { condition: 'Core CPI < 0.2% trending down', explanation: 'Disinflation trend gives Fed room to cut. Risk assets benefit from expected policy easing.', severity: 'medium' },
    },
    keyLevelToWatch: '0.3% is the key level — above triggers concerns, below supports easing narrative',
  },

  'Retail Sales m/m': {
    description: 'Measures the total value of sales at the retail level, reflecting consumer spending patterns.',
    whyItMatters: 'Consumer spending accounts for ~70% of US GDP. Strong retail sales indicate a healthy economy but can fuel inflation concerns.',
    affectedPairs: ['EUR/USD', 'USD/JPY', 'USD/CAD'],
    typicalReaction: {
      beat: 'USD strengthens on growth optimism, equities mixed (growth vs inflation trade-off).',
      miss: 'USD weakens, recession fears increase, safe-haven flows.',
      inline: 'Market looks at control group and ex-auto numbers for detail.',
    },
    frequency: 'Monthly, around 15th',
    releaseTime: '8:30 AM ET',
    source: 'Census Bureau',
    importance: 'Key consumer spending indicator, 70% of GDP',
    riskScenarios: {
      bearish: { condition: 'Retail sales < -0.5%', explanation: 'Consumer pullback signals economic slowdown. GDP growth at risk, recession probabilities rise.', severity: 'medium' },
      bullish: { condition: 'Retail sales > 1.0%', explanation: 'Strong consumer = strong economy. But may fuel inflation, keeping Fed hawkish longer.', severity: 'medium' },
    },
    keyLevelToWatch: '0.0% is the dividing line — positive shows resilience, negative shows stress',
  },

  'Unemployment Rate': {
    description: 'The percentage of the total workforce that is unemployed and actively seeking employment.',
    whyItMatters: 'Part of the Fed\'s dual mandate (maximum employment + stable prices). A rising unemployment rate can trigger dovish Fed action.',
    affectedPairs: ['EUR/USD', 'USD/JPY', 'GBP/USD'],
    typicalReaction: {
      beat: 'Lower unemployment = USD strength, but can also signal overheating.',
      miss: 'Higher unemployment = USD weakness, rate cut expectations surge.',
      inline: 'Market focuses more on NFP number and wage data.',
    },
    frequency: 'Monthly, with NFP on first Friday',
    releaseTime: '8:30 AM ET',
    source: 'Bureau of Labor Statistics',
    importance: 'Part of Fed dual mandate — directly influences policy',
    riskScenarios: {
      bearish: { condition: 'Unemployment > 4.5% or 0.5% jump (Sahm Rule trigger)', explanation: 'Sahm Rule recession signal: when 3-month avg rises 0.5% from 12-month low, recession has historically begun.', severity: 'high' },
      bullish: { condition: 'Unemployment stable at 3.5-3.8%', explanation: 'Tight labor market supports consumer spending and economic growth without overheating.', severity: 'low' },
    },
    keyLevelToWatch: '4.0% is the psychological threshold — above triggers recession fears',
  },

  'GDP q/q': {
    description: 'Gross Domestic Product measures the annualized quarterly change in the total value of goods and services produced.',
    whyItMatters: 'GDP is the broadest measure of economic health. Two consecutive negative quarters = technical recession.',
    affectedPairs: ['EUR/USD', 'USD/JPY', 'GBP/USD'],
    typicalReaction: {
      beat: 'USD strengthens on growth narrative, equities rally.',
      miss: 'Recession fears, USD weakens against safe havens, risk-off.',
      inline: 'Market focuses on GDP components (consumer, business investment).',
    },
    frequency: 'Quarterly (advance, preliminary, final)',
    releaseTime: '8:30 AM ET',
    source: 'Bureau of Economic Analysis',
    importance: 'Broadest economic health measure, though lagging',
    riskScenarios: {
      bearish: { condition: 'GDP negative or near 0%', explanation: 'Contraction signals recession. Risk assets sell, defensive positioning increases, Fed under pressure to ease.', severity: 'high' },
      bullish: { condition: 'GDP > 3% annualized', explanation: 'Strong growth supports corporate earnings, boosts confidence. USD strengthens on economic outperformance.', severity: 'medium' },
    },
    keyLevelToWatch: '2.0% annualized is the trend growth — above signals strength',
  },

  'ISM Manufacturing PMI': {
    description: 'Purchasing Managers Index survey of 300+ manufacturing firms on production, orders, employment, and prices.',
    whyItMatters: 'PMI above 50 = expansion, below 50 = contraction. Leading indicator that signals economic direction before hard data.',
    affectedPairs: ['EUR/USD', 'USD/JPY', 'AUD/USD'],
    typicalReaction: {
      beat: 'USD strengthens, industrial metals rally, equities up.',
      miss: 'USD weakens, risk-off especially in commodity currencies.',
      inline: 'Market focuses on sub-components (new orders, prices paid).',
    },
    frequency: 'Monthly, first business day',
    releaseTime: '10:00 AM ET',
    source: 'Institute for Supply Management',
    importance: 'Leading indicator of economic activity',
    riskScenarios: {
      bearish: { condition: 'PMI < 47 with declining new orders', explanation: 'Deep contraction in manufacturing signals broader economic weakness. Industrial sector dragging GDP growth.', severity: 'medium' },
      bullish: { condition: 'PMI > 52 with rising new orders', explanation: 'Manufacturing expansion drives employment, capex, and GDP. USD benefits from growth outperformance.', severity: 'medium' },
    },
    keyLevelToWatch: '50.0 is the expansion/contraction threshold',
  },

  'Initial Jobless Claims': {
    description: 'Weekly count of individuals filing for unemployment benefits for the first time.',
    whyItMatters: 'Most timely labor market indicator. Sudden spikes can signal emerging employment problems before monthly NFP data.',
    affectedPairs: ['EUR/USD', 'USD/JPY'],
    typicalReaction: {
      beat: 'Lower claims = USD slightly positive, market confidence.',
      miss: 'Higher claims = USD weakness, layoff concerns.',
      inline: 'Usually low impact unless trend is changing.',
    },
    frequency: 'Weekly, every Thursday',
    releaseTime: '8:30 AM ET',
    source: 'Department of Labor',
    importance: 'High-frequency labor market pulse',
    riskScenarios: {
      bearish: { condition: 'Claims > 300K or rising trend', explanation: 'Rising layoffs signal economic deterioration. Consumer spending at risk as income drops.', severity: 'medium' },
      bullish: { condition: 'Claims < 200K steady', explanation: 'Very tight labor market, minimal layoffs supporting consumer confidence.', severity: 'low' },
    },
    keyLevelToWatch: '250K is the worry threshold — above suggests labor market softening',
  },

  'Fed Chair Powell Speaks': {
    description: 'Public remarks by the Federal Reserve Chair on economic outlook, monetary policy, or financial conditions.',
    whyItMatters: 'Powell\'s words can move markets as much as rate decisions. Any hint about policy direction gets immediately priced in.',
    affectedPairs: ['EUR/USD', 'USD/JPY', 'GBP/USD', 'XAU/USD', 'BTC/USD'],
    typicalReaction: {
      beat: 'Hawkish tone: USD rallies, yields up, risk assets down.',
      miss: 'Dovish tone: USD drops, gold/BTC rally, equities up.',
      inline: 'No new information — market reverts to prior positioning.',
    },
    frequency: 'Variable, multiple times per month',
    releaseTime: 'Varies',
    source: 'Federal Reserve',
    importance: 'Can shift rate expectations with a single sentence',
    riskScenarios: {
      bearish: { condition: 'Hawkish surprise — "rates higher for longer"', explanation: 'Reprices entire rate curve higher. Risk assets drop, USD surges, volatility spikes across all markets.', severity: 'high' },
      bullish: { condition: 'Dovish pivot — "considering cuts"', explanation: 'Market prices in easing cycle. Risk assets rally hard, USD weakens, crypto benefits most from loose conditions.', severity: 'high' },
    },
    keyLevelToWatch: 'Watch for keywords: "data-dependent", "restrictive", "progress on inflation"',
  },

  'ADP Non-Farm Employment Change': {
    description: 'Private sector employment report from ADP, released 2 days before the official NFP.',
    whyItMatters: 'Serves as an early signal for Friday\'s NFP, though correlation is imperfect. Still moves markets as traders position ahead of NFP.',
    affectedPairs: ['EUR/USD', 'USD/JPY'],
    typicalReaction: {
      beat: 'Moderate USD strength, positioning for strong NFP.',
      miss: 'Moderate USD weakness, but traders know ADP ≠ NFP.',
      inline: 'Minimal impact, wait for NFP.',
    },
    frequency: 'Monthly, Wednesday before NFP',
    releaseTime: '8:15 AM ET',
    source: 'ADP Research Institute',
    importance: 'NFP preview, moderate standalone impact',
    riskScenarios: {
      bearish: { condition: 'ADP < 100K', explanation: 'Foreshadows weak NFP, markets pre-position for employment weakness.', severity: 'medium' },
      bullish: { condition: 'ADP > 200K', explanation: 'Strong private hiring signals robust economy, builds NFP expectations.', severity: 'low' },
    },
    keyLevelToWatch: '150K is the baseline — deviations set NFP expectations',
  },

  'Crude Oil Inventories': {
    description: 'Weekly change in US commercial crude oil stockpiles reported by the EIA.',
    whyItMatters: 'Directly impacts oil prices, which affect inflation, energy stocks, and commodity currencies (CAD, NOK, RUB).',
    affectedPairs: ['USD/CAD', 'USD/NOK', 'WTI'],
    typicalReaction: {
      beat: 'Inventory draw → oil prices rise, CAD strengthens.',
      miss: 'Inventory build → oil prices drop, CAD weakens.',
      inline: 'Focus on gasoline/distillate inventories.',
    },
    frequency: 'Weekly, Wednesday',
    releaseTime: '10:30 AM ET',
    source: 'Energy Information Administration',
    importance: 'Key for oil traders and commodity currencies',
    riskScenarios: {
      bearish: { condition: 'Build > 5M barrels', explanation: 'Oversupply signal. Oil prices drop, dragging CAD and energy stocks.', severity: 'medium' },
      bullish: { condition: 'Draw > 5M barrels', explanation: 'Tight supply. Oil prices rally, benefiting CAD and energy producers.', severity: 'medium' },
    },
    keyLevelToWatch: 'Consensus expectation is the key — deviations > 3M barrels move oil',
  },

  'PPI m/m': {
    description: 'Producer Price Index measures wholesale-level price changes before they reach consumers.',
    whyItMatters: 'Leading indicator for CPI. Rising producer prices often pass through to consumer prices within 1-3 months.',
    affectedPairs: ['EUR/USD', 'USD/JPY'],
    typicalReaction: {
      beat: 'Higher PPI = CPI concerns, USD slightly stronger, yields up.',
      miss: 'Lower PPI = disinflation signal, USD slightly weaker.',
      inline: 'Low impact, market waits for CPI confirmation.',
    },
    frequency: 'Monthly',
    releaseTime: '8:30 AM ET',
    source: 'Bureau of Labor Statistics',
    importance: 'CPI leading indicator, moderate standalone impact',
    riskScenarios: {
      bearish: { condition: 'PPI > 0.5% m/m', explanation: 'Pipeline inflation pressure building. Suggests CPI will remain elevated, keeping Fed hawkish.', severity: 'medium' },
      bullish: { condition: 'PPI negative', explanation: 'Producer deflation signals easing price pressures ahead for consumers.', severity: 'low' },
    },
    keyLevelToWatch: '0.2% is the neutral zone — above builds CPI anxiety',
  },

  'CB Consumer Confidence': {
    description: 'Survey-based index measuring consumer optimism about the economy, jobs, and spending intentions.',
    whyItMatters: 'Consumer confidence drives spending, which is 70% of GDP. A sharp drop can foreshadow economic slowdown.',
    affectedPairs: ['EUR/USD', 'USD/JPY'],
    typicalReaction: {
      beat: 'USD mildly positive, risk-on.',
      miss: 'USD mildly negative, recession concerns.',
      inline: 'Low impact.',
    },
    frequency: 'Monthly, last Tuesday',
    releaseTime: '10:00 AM ET',
    source: 'Conference Board',
    importance: 'Forward-looking consumer sentiment gauge',
    riskScenarios: {
      bearish: { condition: 'Index < 90 or sharp multi-month decline', explanation: 'Consumer pessimism leads to spending cuts, dragging GDP lower.', severity: 'medium' },
      bullish: { condition: 'Index > 110', explanation: 'High confidence supports continued consumer spending and economic expansion.', severity: 'low' },
    },
    keyLevelToWatch: '100 is the historical average — swings above/below matter',
  },

  'Existing Home Sales': {
    description: 'Measures the annualized number of existing residential buildings sold during the previous month.',
    whyItMatters: 'Housing is a leading economic sector. Sales reflect mortgage rate impact and consumer financial health.',
    affectedPairs: ['EUR/USD'],
    typicalReaction: {
      beat: 'Mild USD positive, housing stocks up.',
      miss: 'Mild USD negative, housing sector concerns.',
      inline: 'Low impact event.',
    },
    frequency: 'Monthly',
    releaseTime: '10:00 AM ET',
    source: 'National Association of Realtors',
    importance: 'Housing market health indicator',
    riskScenarios: {
      bearish: { condition: 'Sales < 3.5M annualized', explanation: 'Housing market freeze from high rates. Wealth effect diminishes, related sectors suffer.', severity: 'low' },
      bullish: { condition: 'Sales > 4.5M annualized', explanation: 'Housing recovery despite rates signals strong consumer demand and economy.', severity: 'low' },
    },
    keyLevelToWatch: '4.0M annualized is the baseline for healthy market activity',
  },

  'Durable Goods Orders m/m': {
    description: 'Measures the change in total value of new orders for long-lasting manufactured goods.',
    whyItMatters: 'Proxy for business investment spending. A leading indicator of manufacturing and economic activity.',
    affectedPairs: ['EUR/USD', 'USD/JPY'],
    typicalReaction: {
      beat: 'USD mildly positive, manufacturing optimism.',
      miss: 'USD mildly negative, business investment concerns.',
      inline: 'Focus on ex-transportation and core capital goods.',
    },
    frequency: 'Monthly',
    releaseTime: '8:30 AM ET',
    source: 'Census Bureau',
    importance: 'Business investment proxy',
    riskScenarios: {
      bearish: { condition: 'Core capital goods orders declining 3+ months', explanation: 'Business investment pullback signals corporate caution and potential economic slowdown.', severity: 'medium' },
      bullish: { condition: 'Orders > 2% with strong core', explanation: 'Strong capex signals business confidence in future growth.', severity: 'low' },
    },
    keyLevelToWatch: 'Ex-transportation number matters more — strips out volatile aircraft orders',
  },

  // ==========================================================================
  // EUR
  // ==========================================================================
  'ECB Interest Rate Decision': {
    description: 'European Central Bank decision on the main refinancing rate, deposit facility rate, and marginal lending rate.',
    whyItMatters: 'Sets borrowing costs for the entire Eurozone. Divergence with Fed rate path drives EUR/USD direction.',
    affectedPairs: ['EUR/USD', 'EUR/GBP', 'EUR/JPY', 'EUR/CHF'],
    typicalReaction: {
      beat: 'Hawkish surprise: EUR rallies, European yields rise.',
      miss: 'Dovish surprise: EUR drops, European equities may rally.',
      inline: 'Focus on Lagarde press conference for forward guidance.',
    },
    frequency: '6 times per year',
    releaseTime: '8:15 AM ET (press conference 8:45 AM)',
    source: 'European Central Bank',
    importance: 'Most important Eurozone event',
    riskScenarios: {
      bearish: { condition: 'Unexpected rate cut or dovish shift', explanation: 'EUR weakens against USD and GBP. European exporters benefit but capital outflows accelerate.', severity: 'high' },
      bullish: { condition: 'Hawkish hold or rate hike', explanation: 'EUR strengthens as rate differential narrows with USD. European bonds sell off.', severity: 'high' },
    },
    keyLevelToWatch: 'Rate differential with Fed Funds rate determines EUR/USD direction',
  },

  'German CPI m/m': {
    description: 'Consumer inflation data for Germany, the Eurozone\'s largest economy.',
    whyItMatters: 'Germany drives Eurozone inflation. Released before Eurozone CPI, it serves as a leading indicator for ECB decisions.',
    affectedPairs: ['EUR/USD', 'EUR/GBP'],
    typicalReaction: {
      beat: 'EUR strengthens on hawkish ECB expectations.',
      miss: 'EUR weakens on dovish ECB expectations.',
      inline: 'Wait for Eurozone-wide CPI.',
    },
    frequency: 'Monthly',
    releaseTime: '8:00 AM ET (preliminary)',
    source: 'Federal Statistical Office of Germany',
    importance: 'Leading indicator for Eurozone CPI',
    riskScenarios: {
      bearish: { condition: 'CPI negative or trending sharply down', explanation: 'Deflationary risk in core Europe. ECB forced to cut, EUR weakens significantly.', severity: 'high' },
      bullish: { condition: 'CPI > 0.4% m/m', explanation: 'Persistent German inflation keeps ECB hawkish, supporting EUR.', severity: 'medium' },
    },
    keyLevelToWatch: '0.2% m/m aligns with ECB 2% target — deviations shift policy bets',
  },

  'German Unemployment Change': {
    description: 'Change in the number of unemployed workers in Germany.',
    whyItMatters: 'German labor market health reflects the Eurozone\'s economic engine. Rising unemployment signals broader European weakness.',
    affectedPairs: ['EUR/USD', 'EUR/GBP'],
    typicalReaction: {
      beat: 'EUR mildly positive.',
      miss: 'EUR mildly negative.',
      inline: 'Low standalone impact.',
    },
    frequency: 'Monthly',
    releaseTime: '3:55 AM ET',
    source: 'Federal Employment Agency',
    importance: 'German labor market pulse',
    riskScenarios: {
      bearish: { condition: 'Unemployment rising > 10K/month for 3+ months', explanation: 'German industrial slowdown spreading to labor market. ECB under pressure to ease.', severity: 'medium' },
      bullish: { condition: 'Unemployment falling consistently', explanation: 'Strong German labor market supports consumer spending and Eurozone growth.', severity: 'low' },
    },
    keyLevelToWatch: '0K change is neutral — rising trend is the real concern',
  },

  'Eurozone CPI y/y': {
    description: 'Harmonized Index of Consumer Prices for the entire Eurozone, year-over-year.',
    whyItMatters: 'ECB\'s primary inflation target is 2% CPI y/y. Deviations from target directly drive rate decisions.',
    affectedPairs: ['EUR/USD', 'EUR/GBP', 'EUR/JPY'],
    typicalReaction: {
      beat: 'EUR strengthens on hawkish ECB bets.',
      miss: 'EUR weakens on dovish ECB bets.',
      inline: 'Focus on core CPI breakdown.',
    },
    frequency: 'Monthly (flash and final)',
    releaseTime: '5:00 AM ET',
    source: 'Eurostat',
    importance: 'ECB\'s target metric — directly drives policy',
    riskScenarios: {
      bearish: { condition: 'CPI < 1.5% y/y', explanation: 'Below-target inflation gives ECB justification for cuts. EUR weakens as rate differential widens vs USD.', severity: 'high' },
      bullish: { condition: 'CPI > 3.0% y/y and rising', explanation: 'Above-target inflation forces ECB to tighten. EUR strengthens against most currencies.', severity: 'medium' },
    },
    keyLevelToWatch: '2.0% is the ECB target — proximity determines policy stance',
  },

  'ECB President Lagarde Speaks': {
    description: 'Public remarks by ECB President Christine Lagarde on monetary policy, economic outlook, or financial stability.',
    whyItMatters: 'Lagarde\'s speeches shape ECB rate expectations. Hawkish or dovish shifts get immediately priced into EUR crosses.',
    affectedPairs: ['EUR/USD', 'EUR/GBP', 'EUR/JPY'],
    typicalReaction: {
      beat: 'Hawkish tone strengthens EUR.',
      miss: 'Dovish tone weakens EUR.',
      inline: 'Market reverts to data-driven positioning.',
    },
    frequency: 'Variable',
    releaseTime: 'Varies',
    source: 'European Central Bank',
    importance: 'Can shift ECB rate expectations significantly',
    riskScenarios: {
      bearish: { condition: 'Signals rate cuts or economic concern', explanation: 'EUR sells off as easing cycle gets priced in. Capital flows favor USD-denominated assets.', severity: 'high' },
      bullish: { condition: 'Emphasizes inflation fight', explanation: 'EUR rallies on hawkish commitment. European yields rise, attracting capital.', severity: 'medium' },
    },
    keyLevelToWatch: 'Listen for: "data-dependent", "persistent inflation", "gradual adjustment"',
  },

  'German ZEW Economic Sentiment': {
    description: 'Survey of 300 financial experts on their 6-month economic outlook for Germany.',
    whyItMatters: 'Leading indicator of economic direction. Financial experts\' expectations often precede actual economic changes.',
    affectedPairs: ['EUR/USD', 'EUR/GBP'],
    typicalReaction: { beat: 'EUR mildly positive.', miss: 'EUR mildly negative.', inline: 'Low impact.' },
    frequency: 'Monthly',
    releaseTime: '5:00 AM ET',
    source: 'ZEW Institute',
    importance: 'Forward-looking sentiment indicator',
    riskScenarios: {
      bearish: { condition: 'ZEW < -10 and declining', explanation: 'Financial experts turning pessimistic on Germany signals Eurozone economic trouble ahead.', severity: 'medium' },
      bullish: { condition: 'ZEW > 15 and rising', explanation: 'Improving expectations support EUR and European equities.', severity: 'low' },
    },
    keyLevelToWatch: '0 divides optimism from pessimism',
  },

  'Eurozone GDP q/q': {
    description: 'Quarterly GDP growth for the entire 20-member Eurozone.',
    whyItMatters: 'Broadest measure of Eurozone economic health. Two negative quarters = Eurozone recession.',
    affectedPairs: ['EUR/USD', 'EUR/GBP', 'EUR/JPY'],
    typicalReaction: { beat: 'EUR strengthens on growth optimism.', miss: 'EUR weakens on recession fears.', inline: 'Focus on country breakdown.' },
    frequency: 'Quarterly',
    releaseTime: '5:00 AM ET',
    source: 'Eurostat',
    importance: 'Broadest Eurozone economic measure',
    riskScenarios: {
      bearish: { condition: 'GDP negative, especially 2nd consecutive quarter', explanation: 'Technical recession in Eurozone. EUR plummets, ECB forced to ease aggressively.', severity: 'high' },
      bullish: { condition: 'GDP > 0.5% q/q', explanation: 'Strong Eurozone growth narrows US growth differential, supporting EUR.', severity: 'medium' },
    },
    keyLevelToWatch: '0.0% is recession/growth boundary',
  },

  'French CPI m/m': {
    description: 'Consumer Price Index for France, the Eurozone\'s second largest economy.',
    whyItMatters: 'France is the #2 Eurozone economy. Its CPI contributes significantly to the Eurozone aggregate.',
    affectedPairs: ['EUR/USD'],
    typicalReaction: { beat: 'Mild EUR support.', miss: 'Mild EUR pressure.', inline: 'Wait for Eurozone CPI.' },
    frequency: 'Monthly',
    releaseTime: '2:45 AM ET',
    source: 'INSEE',
    importance: 'Eurozone CPI component',
    riskScenarios: {
      bearish: { condition: 'Negative or sharply below expectations', explanation: 'French disinflation adds to Eurozone dovish narrative.', severity: 'low' },
      bullish: { condition: 'Above expectations', explanation: 'Adds inflationary pressure to Eurozone aggregate.', severity: 'low' },
    },
    keyLevelToWatch: 'Alignment with German CPI confirms Eurozone trend',
  },

  'Italian GDP q/q': {
    description: 'Quarterly GDP growth for Italy, the Eurozone\'s third largest economy.',
    whyItMatters: 'Italy\'s high debt-to-GDP makes growth crucial. Recession in Italy raises Eurozone sovereign debt concerns.',
    affectedPairs: ['EUR/USD'],
    typicalReaction: { beat: 'Minor EUR support.', miss: 'Sovereign debt concerns may surface.', inline: 'Low impact.' },
    frequency: 'Quarterly',
    releaseTime: '4:00 AM ET',
    source: 'ISTAT',
    importance: 'Italian growth and debt sustainability',
    riskScenarios: {
      bearish: { condition: 'Negative GDP with rising BTP spreads', explanation: 'Italian recession + debt concerns = Eurozone fragmentation risk. EUR under significant pressure.', severity: 'medium' },
      bullish: { condition: 'Positive growth above expectations', explanation: 'Italian recovery supports broader Eurozone narrative.', severity: 'low' },
    },
    keyLevelToWatch: 'BTP-Bund spread matters more than the GDP number itself',
  },

  // ==========================================================================
  // GBP
  // ==========================================================================
  'BOE Interest Rate Decision': {
    description: 'Bank of England Monetary Policy Committee decision on the Bank Rate.',
    whyItMatters: 'Sets UK borrowing costs. BOE divergence from Fed/ECB creates GBP trading opportunities.',
    affectedPairs: ['GBP/USD', 'EUR/GBP', 'GBP/JPY'],
    typicalReaction: {
      beat: 'Hawkish: GBP rallies, UK gilt yields rise.',
      miss: 'Dovish: GBP drops, UK equities may rally.',
      inline: 'Focus on vote split and minutes.',
    },
    frequency: '8 times per year',
    releaseTime: '7:00 AM ET',
    source: 'Bank of England',
    importance: 'Most important UK event',
    riskScenarios: {
      bearish: { condition: 'Dovish surprise or rate cut', explanation: 'GBP weakens against USD and EUR. UK assets repriced for lower rates.', severity: 'high' },
      bullish: { condition: 'Hawkish surprise or rate hike', explanation: 'GBP strengthens. Higher UK rates attract carry trade flows.', severity: 'high' },
    },
    keyLevelToWatch: 'MPC vote split — 9-0 hold vs. 5-4 with dissenters matters',
  },

  'CPI y/y': {
    description: 'UK Consumer Price Index year-over-year change.',
    whyItMatters: 'BOE targets 2% CPI. UK inflation has been persistently high, making this a critical release for rate decisions.',
    affectedPairs: ['GBP/USD', 'EUR/GBP'],
    typicalReaction: {
      beat: 'GBP strengthens on hawkish BOE expectations.',
      miss: 'GBP weakens on dovish BOE expectations.',
      inline: 'Focus on services inflation (BOE\'s key metric).',
    },
    frequency: 'Monthly',
    releaseTime: '2:00 AM ET',
    source: 'Office for National Statistics',
    importance: 'BOE target metric, high sensitivity',
    riskScenarios: {
      bearish: { condition: 'CPI < 2.0% sustained', explanation: 'Below-target inflation gives BOE room to cut aggressively. GBP weakens.', severity: 'medium' },
      bullish: { condition: 'CPI > 4% or services CPI sticky', explanation: 'BOE forced to keep rates high. GBP benefits from yield advantage.', severity: 'high' },
    },
    keyLevelToWatch: '2.0% target — services CPI matters more than headline for BOE',
  },

  'GDP m/m': {
    description: 'Monthly UK GDP growth rate.',
    whyItMatters: 'UK economy is service-sector dominated. Monthly GDP gives real-time pulse on economic health.',
    affectedPairs: ['GBP/USD', 'EUR/GBP'],
    typicalReaction: { beat: 'GBP strengthens.', miss: 'GBP weakens, recession concerns.', inline: 'Focus on services vs manufacturing split.' },
    frequency: 'Monthly',
    releaseTime: '2:00 AM ET',
    source: 'Office for National Statistics',
    importance: 'UK economic pulse',
    riskScenarios: {
      bearish: { condition: 'Negative GDP for 2+ months', explanation: 'UK recession risk rises. GBP under pressure, BOE may need to cut despite inflation.', severity: 'high' },
      bullish: { condition: 'GDP > 0.3% m/m', explanation: 'Strong UK growth supports GBP and reduces recession fears.', severity: 'medium' },
    },
    keyLevelToWatch: '0.0% is the stagnation line',
  },

  'BOE Gov Bailey Speaks': {
    description: 'Public remarks by Bank of England Governor Andrew Bailey.',
    whyItMatters: 'Bailey\'s comments on inflation, growth trade-offs, and rate path directly move GBP.',
    affectedPairs: ['GBP/USD', 'EUR/GBP'],
    typicalReaction: { beat: 'Hawkish tone: GBP up.', miss: 'Dovish tone: GBP down.', inline: 'Neutral positioning.' },
    frequency: 'Variable',
    releaseTime: 'Varies',
    source: 'Bank of England',
    importance: 'Shapes BOE rate expectations',
    riskScenarios: {
      bearish: { condition: 'Signals concern about UK growth', explanation: 'Markets price in faster rate cuts, GBP weakens.', severity: 'medium' },
      bullish: { condition: 'Emphasizes inflation persistence', explanation: 'Higher-for-longer rates support GBP carry.', severity: 'medium' },
    },
    keyLevelToWatch: 'Watch for: "gradual approach", "restrictive for longer", "growth risks"',
  },

  'Manufacturing PMI': {
    description: 'Purchasing Managers Index for the UK manufacturing sector.',
    whyItMatters: 'Although UK is service-heavy, manufacturing PMI signals global trade conditions and industrial health.',
    affectedPairs: ['GBP/USD'],
    typicalReaction: { beat: 'GBP mildly positive.', miss: 'GBP mildly negative.', inline: 'Low impact.' },
    frequency: 'Monthly',
    releaseTime: '4:30 AM ET',
    source: 'S&P Global',
    importance: 'Industrial sector health',
    riskScenarios: {
      bearish: { condition: 'PMI < 47', explanation: 'Deep manufacturing contraction signals broader economic weakness.', severity: 'low' },
      bullish: { condition: 'PMI > 52', explanation: 'Manufacturing expansion signals improving economic conditions.', severity: 'low' },
    },
    keyLevelToWatch: '50 expansion/contraction threshold',
  },

  // ==========================================================================
  // JPY
  // ==========================================================================
  'BOJ Interest Rate Decision': {
    description: 'Bank of Japan decision on the short-term policy rate and yield curve control.',
    whyItMatters: 'BOJ is the last major dovish central bank. Any policy normalization creates massive JPY moves and global carry trade unwinds.',
    affectedPairs: ['USD/JPY', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY'],
    typicalReaction: {
      beat: 'Hawkish: JPY surges, global carry trades unwind.',
      miss: 'Dovish: JPY weakens, carry trades remain attractive.',
      inline: 'Focus on YCC band adjustments and forward guidance.',
    },
    frequency: '8 times per year',
    releaseTime: 'Varies (~11:00 PM - 3:00 AM ET)',
    source: 'Bank of Japan',
    importance: 'Global carry trade cornerstone — moves all JPY crosses',
    riskScenarios: {
      bearish: { condition: 'Rate hike or YCC policy change', explanation: 'Massive JPY rally, global carry unwind. US Treasuries sold by Japanese investors, global yields spike.', severity: 'high' },
      bullish: { condition: 'Continued dovish stance', explanation: 'JPY remains weak, carry trades profitable. Supports risk appetite globally.', severity: 'medium' },
    },
    keyLevelToWatch: 'USD/JPY 150 is the intervention danger zone',
  },

  'Trade Balance': {
    description: 'Difference between a country\'s exports and imports of goods.',
    whyItMatters: 'Trade surplus/deficit affects currency demand. Persistent deficits weaken the currency over time.',
    affectedPairs: ['USD/JPY', 'AUD/USD', 'NZD/USD'],
    typicalReaction: { beat: 'Mild currency positive.', miss: 'Mild currency negative.', inline: 'Low impact.' },
    frequency: 'Monthly',
    releaseTime: 'Varies by country',
    source: 'Various national statistics agencies',
    importance: 'Trade flow and currency demand indicator',
    riskScenarios: {
      bearish: { condition: 'Widening trade deficit', explanation: 'More currency sold to buy imports, structural pressure on the currency.', severity: 'low' },
      bullish: { condition: 'Trade surplus widening', explanation: 'Foreign demand for domestic currency supports appreciation.', severity: 'low' },
    },
    keyLevelToWatch: 'Trend direction matters more than absolute level',
  },

  'BOJ Gov Ueda Speaks': {
    description: 'Public remarks by Bank of Japan Governor Kazuo Ueda on monetary policy and economic outlook.',
    whyItMatters: 'Any hint at policy normalization from Ueda moves JPY crosses violently due to the massive carry trade.',
    affectedPairs: ['USD/JPY', 'EUR/JPY'],
    typicalReaction: { beat: 'Hawkish hint: JPY surges.', miss: 'Dovish: JPY weakens.', inline: 'Market unchanged.' },
    frequency: 'Variable',
    releaseTime: 'Varies (usually Asian session)',
    source: 'Bank of Japan',
    importance: 'Critical for JPY direction',
    riskScenarios: {
      bearish: { condition: 'Hints at policy normalization', explanation: 'Carry trade unwind risk. Global risk assets can drop as JPY funding costs rise.', severity: 'high' },
      bullish: { condition: 'Emphasizes accommodative stance', explanation: 'Carry trade safe, JPY remains weak. Supports global risk appetite.', severity: 'medium' },
    },
    keyLevelToWatch: 'Listen for: "sustainable inflation", "wage growth", "policy adjustment"',
  },

  'Tankan Manufacturing Index': {
    description: 'Bank of Japan\'s quarterly survey of large manufacturing firms\' business conditions.',
    whyItMatters: 'BOJ\'s own survey — used directly in policy decisions. Captures Japanese corporate sentiment.',
    affectedPairs: ['USD/JPY'],
    typicalReaction: { beat: 'JPY mildly positive.', miss: 'JPY mildly negative.', inline: 'Low impact.' },
    frequency: 'Quarterly',
    releaseTime: '7:50 PM ET (previous day)',
    source: 'Bank of Japan',
    importance: 'BOJ\'s own business conditions survey',
    riskScenarios: {
      bearish: { condition: 'Index negative and declining', explanation: 'Japanese manufacturers pessimistic. BOJ less likely to tighten.', severity: 'low' },
      bullish: { condition: 'Index positive and improving', explanation: 'Supports BOJ normalization narrative. JPY may strengthen.', severity: 'low' },
    },
    keyLevelToWatch: '0 is the optimism/pessimism divide',
  },

  // ==========================================================================
  // AUD
  // ==========================================================================
  'RBA Interest Rate Decision': {
    description: 'Reserve Bank of Australia decision on the cash rate target.',
    whyItMatters: 'AUD is a commodity currency. RBA decisions reflect both domestic and China-linked economic conditions.',
    affectedPairs: ['AUD/USD', 'AUD/JPY', 'AUD/NZD'],
    typicalReaction: {
      beat: 'Hawkish: AUD rallies.',
      miss: 'Dovish: AUD drops.',
      inline: 'Focus on statement language.',
    },
    frequency: '11 times per year',
    releaseTime: '12:30 AM ET',
    source: 'Reserve Bank of Australia',
    importance: 'Key for AUD and Asia-Pacific sentiment',
    riskScenarios: {
      bearish: { condition: 'Rate cut or dovish pivot', explanation: 'AUD weakens, commodity currencies under pressure. Reflects China slowdown concerns.', severity: 'high' },
      bullish: { condition: 'Rate hike or hawkish surprise', explanation: 'AUD rallies on yield advantage. Signals strong Australian economy.', severity: 'high' },
    },
    keyLevelToWatch: 'Rate differential with Fed Funds determines AUD/USD bias',
  },

  'Employment Change': {
    description: 'Monthly change in the number of employed people.',
    whyItMatters: 'Australia\'s employment data directly influences RBA decisions. Strong labor market supports hawkish stance.',
    affectedPairs: ['AUD/USD', 'AUD/JPY'],
    typicalReaction: { beat: 'AUD strengthens.', miss: 'AUD weakens.', inline: 'Focus on full-time vs part-time split.' },
    frequency: 'Monthly',
    releaseTime: '7:30 PM ET (previous day)',
    source: 'Australian Bureau of Statistics',
    importance: 'Key RBA input',
    riskScenarios: {
      bearish: { condition: 'Negative employment change', explanation: 'Labor market weakening. RBA likely to cut, AUD under pressure.', severity: 'medium' },
      bullish: { condition: 'Employment > 30K with full-time gains', explanation: 'Strong labor market keeps RBA hawkish, supporting AUD.', severity: 'medium' },
    },
    keyLevelToWatch: '15K is the consensus baseline — full-time vs part-time split matters more',
  },

  'CPI q/q': {
    description: 'Quarterly Consumer Price Index for Australia.',
    whyItMatters: 'Australia reports CPI quarterly, making each release 3x more significant than monthly reporters.',
    affectedPairs: ['AUD/USD', 'AUD/NZD'],
    typicalReaction: { beat: 'AUD rallies on hawkish RBA bets.', miss: 'AUD drops on dovish RBA bets.', inline: 'Focus on trimmed mean.' },
    frequency: 'Quarterly',
    releaseTime: '7:30 PM ET (previous day)',
    source: 'Australian Bureau of Statistics',
    importance: 'Quarterly = each release carries heavy weight',
    riskScenarios: {
      bearish: { condition: 'CPI < 0.5% q/q', explanation: 'Disinflation opens door for RBA cuts. AUD weakens.', severity: 'medium' },
      bullish: { condition: 'CPI > 1.2% q/q', explanation: 'Sticky inflation forces RBA to maintain or raise rates. AUD benefits.', severity: 'high' },
    },
    keyLevelToWatch: '0.8% q/q aligns with 2-3% annual target range',
  },

  // ==========================================================================
  // CAD
  // ==========================================================================
  'BOC Interest Rate Decision': {
    description: 'Bank of Canada decision on the overnight lending rate.',
    whyItMatters: 'CAD is heavily linked to oil prices and US economic conditions. BOC often follows Fed direction.',
    affectedPairs: ['USD/CAD', 'CAD/JPY'],
    typicalReaction: {
      beat: 'Hawkish: CAD strengthens (USD/CAD drops).',
      miss: 'Dovish: CAD weakens (USD/CAD rises).',
      inline: 'Focus on Monetary Policy Report.',
    },
    frequency: '8 times per year',
    releaseTime: '10:00 AM ET',
    source: 'Bank of Canada',
    importance: 'Key for CAD and oil-linked currencies',
    riskScenarios: {
      bearish: { condition: 'Rate cut or dovish forward guidance', explanation: 'CAD weakens vs USD. Oil correlation amplifies moves.', severity: 'high' },
      bullish: { condition: 'Rate hike or hawkish surprise', explanation: 'CAD strengthens. BOC-Fed divergence favoring CAD.', severity: 'high' },
    },
    keyLevelToWatch: 'BOC-Fed rate differential drives USD/CAD direction',
  },

  // ==========================================================================
  // CHF
  // ==========================================================================
  'SNB Interest Rate Decision': {
    description: 'Swiss National Bank decision on the policy rate.',
    whyItMatters: 'CHF is a major safe-haven currency. SNB intervention and rate decisions affect global risk sentiment.',
    affectedPairs: ['USD/CHF', 'EUR/CHF'],
    typicalReaction: {
      beat: 'Hawkish: CHF strengthens.',
      miss: 'Dovish: CHF weakens.',
      inline: 'Focus on FX intervention signals.',
    },
    frequency: 'Quarterly',
    releaseTime: '3:30 AM ET',
    source: 'Swiss National Bank',
    importance: 'Safe-haven currency policy driver',
    riskScenarios: {
      bearish: { condition: 'Rate cut or intervention hints', explanation: 'SNB actively weakening CHF. EUR/CHF rises, safe-haven premium eroded.', severity: 'medium' },
      bullish: { condition: 'Hawkish hold + reduced intervention', explanation: 'CHF strengthens as SNB steps back. Safe-haven status reinforced.', severity: 'medium' },
    },
    keyLevelToWatch: 'EUR/CHF 0.95 is the SNB intervention floor watch level',
  },

  // ==========================================================================
  // NZD
  // ==========================================================================
  'RBNZ Interest Rate Decision': {
    description: 'Reserve Bank of New Zealand decision on the Official Cash Rate.',
    whyItMatters: 'RBNZ is often a rate cycle leader — first to hike, first to cut. NZD movements signal broader commodity currency direction.',
    affectedPairs: ['NZD/USD', 'AUD/NZD'],
    typicalReaction: {
      beat: 'Hawkish: NZD rallies.',
      miss: 'Dovish: NZD drops.',
      inline: 'Focus on rate path projections.',
    },
    frequency: '7 times per year',
    releaseTime: '9:00 PM ET (previous day)',
    source: 'Reserve Bank of New Zealand',
    importance: 'Rate cycle leader among DM central banks',
    riskScenarios: {
      bearish: { condition: 'Aggressive rate cut or dovish pivot', explanation: 'NZD weakens. May signal coming AUD and broader commodity currency weakness.', severity: 'high' },
      bullish: { condition: 'Hawkish hold or hike', explanation: 'NZD rallies on yield advantage. High-carry trade flows into NZD.', severity: 'high' },
    },
    keyLevelToWatch: 'RBNZ rate path projection vs market pricing gap',
  },

  'Employment Change q/q': {
    description: 'Quarterly change in New Zealand employment levels.',
    whyItMatters: 'Small economy = each employment data point heavily impacts RBNZ thinking.',
    affectedPairs: ['NZD/USD'],
    typicalReaction: { beat: 'NZD positive.', miss: 'NZD negative.', inline: 'Low impact.' },
    frequency: 'Quarterly',
    releaseTime: '6:45 PM ET (previous day)',
    source: 'Statistics New Zealand',
    importance: 'RBNZ employment mandate input',
    riskScenarios: {
      bearish: { condition: 'Negative employment growth', explanation: 'RBNZ forced to cut. NZD weakens as yield advantage erodes.', severity: 'medium' },
      bullish: { condition: 'Employment > 0.5% q/q', explanation: 'Strong labor market supports RBNZ hawkishness. NZD benefits.', severity: 'medium' },
    },
    keyLevelToWatch: '0.0% is the growth/contraction threshold',
  },

  // ==========================================================================
  // CNY
  // ==========================================================================
  'Manufacturing PMI (CN)': {
    description: 'Official Purchasing Managers Index for China\'s manufacturing sector.',
    whyItMatters: 'China is the world\'s manufacturing hub. Its PMI impacts global trade, commodity demand, and risk sentiment.',
    affectedPairs: ['AUD/USD', 'NZD/USD', 'USD/CNH', 'Copper', 'Iron Ore'],
    typicalReaction: {
      beat: 'AUD/NZD rally, commodity prices up, risk-on.',
      miss: 'AUD/NZD drop, commodities down, risk-off.',
      inline: 'Focus on new orders sub-index.',
    },
    frequency: 'Monthly, last day',
    releaseTime: '9:00 PM ET (previous day)',
    source: 'National Bureau of Statistics of China',
    importance: 'Global manufacturing and commodity demand bellwether',
    riskScenarios: {
      bearish: { condition: 'PMI < 49 for 3+ months', explanation: 'Sustained Chinese manufacturing contraction. Global commodity demand drops, AUD/NZD under pressure.', severity: 'high' },
      bullish: { condition: 'PMI > 51 with rising new orders', explanation: 'Chinese recovery boosts global trade and commodity demand. AUD, NZD, emerging markets benefit.', severity: 'high' },
    },
    keyLevelToWatch: '50.0 expansion/contraction — new orders sub-index is the forward-looking signal',
  },
};

/**
 * Look up event details by event name.
 * Falls back to a generic template if no exact match is found.
 */
export function getEventDetail(eventName: string): EventDetail | null {
  return EVENT_DATABASE[eventName] || null;
}
