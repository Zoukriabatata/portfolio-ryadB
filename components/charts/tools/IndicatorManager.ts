import type { IChartApi, ISeriesApi, LineData, Time, LineWidth } from 'lightweight-charts';
import { LineSeries } from 'lightweight-charts';
import type { Candle } from '@/types/market';
import type { IndicatorConfig } from '@/types/charts';

export class IndicatorManager {
  private chart: IChartApi;
  private seriesMap: Map<string, ISeriesApi<'Line'>> = new Map();

  constructor(chart: IChartApi) {
    this.chart = chart;
  }

  updateIndicators(indicators: IndicatorConfig[], candles: Candle[]): void {
    // Remove series for disabled or removed indicators
    this.seriesMap.forEach((series, id) => {
      const indicator = indicators.find(i => i.id === id);
      if (!indicator || !indicator.enabled) {
        try {
          this.chart.removeSeries(series);
        } catch (e) {
          // Series may already be removed
        }
        this.seriesMap.delete(id);
      }
    });

    // Add or update series for enabled indicators
    indicators.filter(i => i.enabled).forEach(indicator => {
      const data = this.calculateIndicator(indicator, candles);
      if (data.length === 0) return;

      let series = this.seriesMap.get(indicator.id);

      if (!series) {
        series = this.chart.addSeries(LineSeries, {
          color: indicator.style.color,
          lineWidth: indicator.style.lineWidth as LineWidth,
          priceScaleId: indicator.paneId === 'main' ? 'right' : indicator.id,
          lastValueVisible: true,
          priceLineVisible: false,
        });
        this.seriesMap.set(indicator.id, series);
      }

      series.setData(data);
      series.applyOptions({
        color: indicator.style.color,
        lineWidth: indicator.style.lineWidth as LineWidth,
      });
    });
  }

  private calculateIndicator(indicator: IndicatorConfig, candles: Candle[]): LineData<Time>[] {
    switch (indicator.type) {
      case 'VWAP':
        return this.calculateVWAP(candles);
      case 'TWAP':
        return this.calculateTWAP(candles);
      case 'VolumeProfile':
        // Volume Profile is rendered separately as histogram, return empty
        return [];
      default:
        return [];
    }
  }

  private calculateVWAP(candles: Candle[]): LineData<Time>[] {
    if (candles.length === 0) return [];

    const result: LineData<Time>[] = [];
    let cumulativeTPV = 0;
    let cumulativeVolume = 0;

    // Find session start (beginning of day or session)
    candles.forEach(candle => {
      const tp = (candle.high + candle.low + candle.close) / 3;
      cumulativeTPV += tp * candle.volume;
      cumulativeVolume += candle.volume;

      const vwap = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : tp;

      result.push({
        time: candle.time as Time,
        value: vwap,
      });
    });

    return result;
  }

  private calculateTWAP(candles: Candle[]): LineData<Time>[] {
    if (candles.length === 0) return [];

    const result: LineData<Time>[] = [];
    let cumulativePrice = 0;

    candles.forEach((candle, i) => {
      const tp = (candle.high + candle.low + candle.close) / 3;
      cumulativePrice += tp;

      const twap = cumulativePrice / (i + 1);

      result.push({
        time: candle.time as Time,
        value: twap,
      });
    });

    return result;
  }

  removeAll(): void {
    this.seriesMap.forEach(series => {
      try {
        this.chart.removeSeries(series);
      } catch (e) {
        // Ignore
      }
    });
    this.seriesMap.clear();
  }

  destroy(): void {
    this.removeAll();
  }
}
