import type { SiteParameters, TurbineParameters } from './annual-yield.ts';

export const MASTER_DATA_KINDS: readonly ['mast', 'turbine', 'site'] = ['mast', 'turbine', 'site'];

export type MasterDataKind = (typeof MASTER_DATA_KINDS)[number];

export interface MastRecord {
  readonly kind: 'mast';
  readonly id: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly measurementHeightM: number;
}

export interface TurbineRecord extends TurbineParameters {
  readonly kind: 'turbine';
  readonly id: string;
  readonly name: string;
  readonly rotorDiameterM: number;
  readonly version: number;
  readonly updatedAt: string;
}

export interface SiteRecord extends SiteParameters {
  readonly kind: 'site';
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly updatedAt: string;
}

export type MasterDataRecord = MastRecord | TurbineRecord | SiteRecord;
