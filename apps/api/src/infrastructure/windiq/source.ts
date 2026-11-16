import type { z } from 'zod';
import type {
  MeasurementFilter,
  MeasurementSource,
  SourceDocument,
  SourceRow,
} from '../../application/ports.ts';
import type { MasterDataKind, MasterDataRecord } from '../../domain/master-data.ts';
import { contentHash } from '../content-hash.ts';
import type { WindIqClient } from './client.ts';
import { mastSchema, measurementRowSchema, siteSchema, turbineSchema } from './schemas.ts';

interface MasterDataEndpoint {
  readonly path: string;
  readonly schema: z.ZodType<MasterDataRecord>;
}

const MASTER_DATA: Record<MasterDataKind, MasterDataEndpoint> = {
  mast: { path: '/v1/mast', schema: mastSchema },
  turbine: { path: '/v1/turbine', schema: turbineSchema },
  site: { path: '/v1/site', schema: siteSchema },
};

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

function validate(kind: MasterDataKind, payload: unknown): SourceDocument['validation'] {
  const document = MASTER_DATA[kind].schema.safeParse(payload);

  return document.success
    ? { accepted: true, record: document.data }
    : { accepted: false, reason: describeIssues(document.error) };
}

function readRow(payload: unknown): SourceRow {
  const row = measurementRowSchema.safeParse(payload);

  return row.success ? { ok: true, raw: row.data, payload } : { ok: false, payload };
}

export function createWindIqSource(client: WindIqClient): MeasurementSource {
  return {
    async masterData(kind: MasterDataKind): Promise<SourceDocument> {
      const payload = await client.get(MASTER_DATA[kind].path);

      return { payload, contentHash: contentHash(payload), validation: validate(kind, payload) };
    },

    async *measurementPages(filter: MeasurementFilter): AsyncGenerator<readonly SourceRow[]> {
      const query = filter.by === 'updated' ? { updatedSince: filter.since } : {};

      for await (const rows of client.measurementPages(query)) {
        yield rows.map(readRow);
      }
    },
  };
}
