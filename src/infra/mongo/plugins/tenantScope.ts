import mongoose, {
  type Document,
  type FilterQuery,
  type Model,
  type QueryOptions,
  type Schema,
  type UpdateQuery,
} from 'mongoose';
import { logger } from '../../../observability/logger.js';

export type TenantId = mongoose.Types.ObjectId | string;

// D extends Document, so it already carries both the schema fields and the
// document methods. Typing the queries with D (not HydratedDocument<D>) keeps
// .lean() able to recover the field shape instead of collapsing to FlattenMaps<unknown>.
// The 4th Query generic (RawDocType) is what .lean() reads to recover the plain
// object shape. Passing D there keeps `forTenant(...).findOne(...).lean()` typed as
// the document fields instead of collapsing to FlattenMaps<unknown>.
export interface TenantScope<D extends Document> {
  find(filter?: FilterQuery<D>): mongoose.Query<D[], D, {}, D>;
  findOne(filter?: FilterQuery<D>): mongoose.Query<D | null, D, {}, D>;
  updateMany(
    filter: FilterQuery<D>,
    update: UpdateQuery<D>,
    options?: QueryOptions,
  ): mongoose.Query<mongoose.UpdateWriteOpResult, D, {}, D>;
  deleteMany(
    filter?: FilterQuery<D>,
  ): mongoose.Query<mongoose.mongo.DeleteResult, D, {}, D>;
  findOneAndUpdate(
    filter: FilterQuery<D>,
    update: UpdateQuery<D>,
    options?: QueryOptions & { new?: boolean },
  ): mongoose.Query<D | null, D, {}, D>;
  countDocuments(filter?: FilterQuery<D>): mongoose.Query<number, D, {}, D>;
}

export interface WithTenantScope<D extends Document> extends Model<D> {
  forTenant(tenantId: TenantId): TenantScope<D>;
}

const WATCHED_OPS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'updateMany',
  'updateOne',
  'deleteMany',
  'deleteOne',
  'countDocuments',
] as const;

export function tenantScopePlugin<D extends Document>(schema: Schema<D>): void {
  for (const op of WATCHED_OPS) {
    schema.pre(op, function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filter = (this as any).getFilter?.() ?? {};
      if (!filter.tenantId) {
        logger.warn(
          { op },
          'query missing tenantId — potential cross-tenant data leak',
        );
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (schema.statics as any)['forTenant'] = function (
    this: Model<D>,
    tenantId: TenantId,
  ): TenantScope<D> {
    const M = this;
    const tid =
      typeof tenantId === 'string'
        ? new mongoose.Types.ObjectId(tenantId)
        : tenantId;

    return {
      find: (filter: FilterQuery<D> = {} as FilterQuery<D>) =>
        M.find({ ...filter, tenantId: tid }),
      findOne: (filter: FilterQuery<D> = {} as FilterQuery<D>) =>
        M.findOne({ ...filter, tenantId: tid }),
      updateMany: (
        filter: FilterQuery<D>,
        update: UpdateQuery<D>,
        options?: QueryOptions,
      ) =>
        M.updateMany(
          { ...filter, tenantId: tid },
          update,
          options as Parameters<typeof M.updateMany>[2],
        ),
      findOneAndUpdate: (
        filter: FilterQuery<D>,
        update: UpdateQuery<D>,
        options?: QueryOptions & { new?: boolean },
      ) => M.findOneAndUpdate({ ...filter, tenantId: tid }, update, options),
      deleteMany: (filter: FilterQuery<D> = {} as FilterQuery<D>) =>
        M.deleteMany({ ...filter, tenantId: tid }),
      countDocuments: (filter: FilterQuery<D> = {} as FilterQuery<D>) =>
        M.countDocuments({ ...filter, tenantId: tid }),
    };
  };
}
