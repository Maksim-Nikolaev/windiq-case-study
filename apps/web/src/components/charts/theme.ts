import { f } from '@/lib/format.ts';
import type { ChartTokens } from './Chart.tsx';

export function axisStyle(tokens: ChartTokens) {
  return {
    axisLine: { lineStyle: { color: tokens.grid } },
    axisTick: { show: false },
    axisLabel: { color: tokens.textMuted, fontSize: 12 },
    splitLine: { lineStyle: { color: tokens.grid, width: 1, type: 'solid' } },
    nameTextStyle: { color: tokens.textMuted, fontSize: 12 },
  };
}

export function tooltipStyle(tokens: ChartTokens) {
  return {
    backgroundColor: tokens.surface,
    borderColor: tokens.grid,
    textStyle: { color: tokens.text, fontSize: 13 },
    extraCssText: 'box-shadow: 0 4px 16px rgb(0 0 0 / 12%);',
  };
}

export const GRID = { left: 8, right: 16, top: 24, bottom: 8, containLabel: true };
export const GRID_WITH_AXIS_NAME = { ...GRID, bottom: 32 };
export const BAR_MAX_WIDTH_PX = 24;
export const BAR_RADIUS: readonly number[] = [4, 4, 0, 0];

export function valueAxisStyle(tokens: ChartTokens) {
  const style = axisStyle(tokens);

  return {
    ...style,
    axisLabel: { ...style.axisLabel, formatter: (value: number) => f.number(value) },
  };
}

export function barStates(tokens: ChartTokens) {
  return {
    emphasis: { itemStyle: { color: tokens.series1Emphasis } },
  };
}
