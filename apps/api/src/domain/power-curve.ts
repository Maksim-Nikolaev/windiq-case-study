export interface PowerCurvePoint {
  readonly windSpeedMs: number;
  readonly powerKw: number;
}

export interface PowerCurve {
  readonly cutInMs: number;
  readonly cutOutMs: number;
  readonly points: readonly PowerCurvePoint[];
}

export function isUsablePowerCurve(curve: PowerCurve): boolean {
  const ascending = curve.points.every((point, index) => {
    const previous = curve.points[index - 1];

    return previous === undefined || point.windSpeedMs > previous.windSpeedMs;
  });
  const nonNegative = curve.points.every((point) => point.windSpeedMs >= 0 && point.powerKw >= 0);

  return curve.points.length >= 2 && ascending && nonNegative && curve.cutOutMs > curve.cutInMs;
}

export function powerKwAt(curve: PowerCurve, hubWindSpeedMs: number): number {
  if (hubWindSpeedMs < curve.cutInMs || hubWindSpeedMs > curve.cutOutMs) {
    return 0;
  }

  const upperIndex = curve.points.findIndex((point) => point.windSpeedMs >= hubWindSpeedMs);
  const upper = curve.points[upperIndex];
  const lower = curve.points[upperIndex - 1];

  if (upper === undefined) {
    return curve.points.at(-1)?.powerKw ?? 0;
  }

  if (lower === undefined) {
    return upper.windSpeedMs === hubWindSpeedMs ? upper.powerKw : 0;
  }

  const share = (hubWindSpeedMs - lower.windSpeedMs) / (upper.windSpeedMs - lower.windSpeedMs);

  return lower.powerKw + share * (upper.powerKw - lower.powerKw);
}
