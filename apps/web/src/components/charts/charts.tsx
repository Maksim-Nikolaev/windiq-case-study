'use client';

import type { YieldBreakdown, YieldHistory, YieldInputs } from '@/lib/api.ts';
import { f } from '@/lib/format.ts';
import { t } from '@/lib/texts.ts';
import { Chart, type ChartOption, type ChartTokens } from './Chart.tsx';
import {
  axisStyle,
  BAR_MAX_WIDTH_PX,
  BAR_RADIUS,
  barStates,
  GRID,
  GRID_WITH_AXIS_NAME,
  tooltipStyle,
  valueAxisStyle,
} from './theme.ts';

type Months = YieldBreakdown['months'];
type WindSpeedBins = YieldBreakdown['windSpeedBins'];
type HistoryPoints = YieldHistory['points'];

interface PowerCurveData {
  readonly turbine: YieldInputs['turbine'];
  readonly meanHubWindSpeedMs: number;
}

const SHOWN_BINS = 27;

function monthlyOption(months: Months, tokens: ChartTokens): ChartOption {
  return {
    grid: GRID,
    tooltip: {
      ...tooltipStyle(tokens),
      trigger: 'axis',
      axisPointer: { type: 'none' },
      valueFormatter: (value: number) => `${f.number(value)} MWh`,
    },
    xAxis: {
      ...axisStyle(tokens),
      type: 'category',
      data: months.map((month) => f.month(month.month)),
      splitLine: { show: false },
    },
    yAxis: { ...valueAxisStyle(tokens), type: 'value', name: 'MWh' },
    series: [
      {
        name: t.charts.netYield,
        type: 'bar',
        data: months.map((month) => month.netMwh),
        barMaxWidth: BAR_MAX_WIDTH_PX,
        itemStyle: { color: tokens.series1, borderRadius: BAR_RADIUS },
        ...barStates(tokens),
      },
    ],
  };
}

function distributionOption(bins: WindSpeedBins, tokens: ChartTokens): ChartOption {
  const shown = bins.slice(0, SHOWN_BINS);

  return {
    grid: GRID_WITH_AXIS_NAME,
    tooltip: {
      ...tooltipStyle(tokens),
      trigger: 'axis',
      axisPointer: { type: 'none' },
      formatter: (params: readonly { dataIndex: number }[]) => {
        const bin = shown[params[0]?.dataIndex ?? 0];

        return bin === undefined
          ? ''
          : `${bin.fromMs}–${bin.fromMs + 1} m/s<br/><b>${f.number(bin.hours)} h</b> · ${f.number(bin.grossMwh)} ${t.charts.grossSuffix}`;
      },
    },
    xAxis: {
      ...axisStyle(tokens),
      type: 'category',
      name: t.charts.hubSpeedAxis,
      nameLocation: 'middle',
      nameGap: 28,
      data: shown.map((bin) => String(bin.fromMs)),
      splitLine: { show: false },
    },
    yAxis: { ...valueAxisStyle(tokens), type: 'value', name: t.charts.hours },
    series: [
      {
        name: t.charts.hours,
        type: 'bar',
        data: shown.map((bin) => bin.hours),
        barMaxWidth: BAR_MAX_WIDTH_PX,
        itemStyle: { color: tokens.series1, borderRadius: BAR_RADIUS },
        ...barStates(tokens),
      },
    ],
  };
}

function powerCurveOption(data: PowerCurveData, tokens: ChartTokens): ChartOption {
  return {
    grid: GRID_WITH_AXIS_NAME,
    tooltip: {
      ...tooltipStyle(tokens),
      trigger: 'axis',
      formatter: (params: readonly { value: readonly [number, number] }[]) => {
        const point = params[0]?.value;

        return point === undefined
          ? ''
          : `${f.number(point[0])} m/s<br/><b>${f.number(point[1])} kW</b>`;
      },
    },
    xAxis: {
      ...axisStyle(tokens),
      type: 'value',
      name: t.charts.hubSpeedAxis,
      nameLocation: 'middle',
      nameGap: 28,
      max: data.turbine.cutOutMs,
      splitLine: { show: false },
    },
    yAxis: { ...valueAxisStyle(tokens), type: 'value', name: 'kW' },
    series: [
      {
        name: t.charts.power,
        type: 'line',
        showSymbol: false,
        lineStyle: { color: tokens.series1, width: 2 },
        itemStyle: { color: tokens.series1 },
        areaStyle: { color: tokens.series1, opacity: 0.1 },
        data: data.turbine.powerCurve.map((point) => [point.windSpeedMs, point.powerKw]),
        markLine: {
          symbol: 'none',
          lineStyle: { color: tokens.textMuted, width: 1, type: 'solid' },
          label: {
            color: tokens.textMuted,
            formatter: t.charts.mean(f.number(data.meanHubWindSpeedMs, 1)),
          },
          data: [{ xAxis: data.meanHubWindSpeedMs }],
        },
      },
    ],
  };
}

function historyOption(points: HistoryPoints, tokens: ChartTokens): ChartOption {
  const line = (name: string, color: string, values: readonly number[]) => ({
    name,
    type: 'line',
    step: 'end',
    showSymbol: points.length < 3,
    symbolSize: 8,
    lineStyle: { color, width: 2 },
    itemStyle: { color, borderColor: tokens.surface, borderWidth: 2 },
    endLabel: { show: true, color: tokens.text, formatter: name },
    data: values,
  });

  return {
    grid: { ...GRID, right: 48 },
    legend: { top: 0, right: 0, textStyle: { color: tokens.textMuted }, icon: 'roundRect' },
    tooltip: {
      ...tooltipStyle(tokens),
      trigger: 'axis',
      valueFormatter: (value: number) => `${f.number(value)} MWh`,
    },
    xAxis: {
      ...axisStyle(tokens),
      type: 'category',
      data: points.map((point) => f.shortDateTime(point.computedAt)),
      splitLine: { show: false },
      boundaryGap: false,
    },
    yAxis: { ...valueAxisStyle(tokens), type: 'value', name: 'MWh', scale: true },
    series: [
      line(
        'P50',
        tokens.series1,
        points.map((point) => point.p50Mwh),
      ),
      line(
        'P90',
        tokens.series2,
        points.map((point) => point.p90Mwh),
      ),
    ],
  };
}

export function MonthlyEnergyChart({ months }: { readonly months: Months }) {
  return <Chart data={months} build={monthlyOption} heightPx={280} label={t.charts.monthlyLabel} />;
}

export function WindSpeedDistributionChart({ bins }: { readonly bins: WindSpeedBins }) {
  return (
    <Chart
      data={bins}
      build={distributionOption}
      heightPx={280}
      label={t.charts.distributionLabel}
    />
  );
}

export function PowerCurveChart(data: PowerCurveData) {
  return (
    <Chart data={data} build={powerCurveOption} heightPx={280} label={t.charts.powerCurveLabel} />
  );
}

export function YieldHistoryChart({ points }: { readonly points: HistoryPoints }) {
  return <Chart data={points} build={historyOption} heightPx={280} label={t.charts.historyLabel} />;
}
