'use client';

import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  SVGRenderer,
]);

export type ChartOption = echarts.EChartsCoreOption;

export interface ChartTokens {
  readonly text: string;
  readonly textMuted: string;
  readonly grid: string;
  readonly surface: string;
  readonly series1: string;
  readonly series1Emphasis: string;
  readonly series2: string;
}

interface ChartProps<Data> {
  readonly data: Data;
  readonly build: (data: Data, tokens: ChartTokens) => ChartOption;
  readonly heightPx: number;
  readonly label: string;
}

function readTokens(element: HTMLElement): ChartTokens {
  const probe = document.createElement('span');
  element.append(probe);

  const token = (name: string) => {
    probe.style.color = `var(${name})`;

    return getComputedStyle(probe).color;
  };
  const tokens: ChartTokens = {
    text: token('--text-primary'),
    textMuted: token('--text-secondary'),
    grid: token('--grid'),
    surface: token('--surface-1'),
    series1: token('--series-1'),
    series1Emphasis: token('--series-1-emphasis'),
    series2: token('--series-2'),
  };

  probe.remove();

  return tokens;
}

type ChartInstance = ReturnType<typeof echarts.init>;

export function Chart<Data>({ data, build, heightPx, label }: ChartProps<Data>) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<ChartInstance | null>(null);
  const latest = useRef({ data, build });

  latest.current = { data, build };

  useEffect(() => {
    const element = container.current;

    if (element === null) {
      return;
    }

    const render = () => {
      const current = latest.current;

      instance.current?.setOption(current.build(current.data, readTokens(element)));
    };
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === 0) {
        return;
      }

      if (instance.current === null) {
        instance.current = echarts.init(element, null, { renderer: 'svg' });
        render();

        return;
      }

      instance.current.resize();
    });
    const themeObserver = new MutationObserver(render);

    observer.observe(element);
    themeObserver.observe(document.documentElement, { attributeFilter: ['data-theme'] });

    return () => {
      themeObserver.disconnect();
      observer.disconnect();
      instance.current?.dispose();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    const element = container.current;

    if (element !== null) {
      instance.current?.setOption(build(data, readTokens(element)));
    }
  }, [data, build]);

  return (
    <div
      ref={container}
      className="chart"
      role="img"
      aria-label={label}
      style={{ height: heightPx }}
    />
  );
}
