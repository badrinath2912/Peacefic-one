import { escapeRegex, type PaginationMeta } from '@peacefic/shared';
import mongoose, {
  type ClientSession,
  type FilterQuery,
  type Model,
  type PipelineStage,
  type ProjectionType,
  type QueryOptions,
  type SortOrder,
  type UpdateQuery,
} from 'mongoose';

import { requestContext } from '@/config/request-context';
import { InternalError, NotFoundError, ValidationError } from '@/errors';

export interface ListOptions {
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
  fields?: string;
  include?: string;
  cursor?: string;
  session?: ClientSession;
  /** Extra filter merged after whitelisting. Server-built only, never raw user input. */
  filter?: FilterQuery<unknown>;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface RepositoryConfig {
  /** When true, every query is scoped to the caller's collegeId. */
  tenantScoped: boolean;
  /** Fields the client may sort by. Anything else is rejected. */
  sortableFields: string[];
  /** Fields free-text search may touch. */
  searchableFields: string[];
  /** Fields the client may filter on, with the operator suffix syntax. */
  filterableFields: string[];
  /** Relations the client may request via `include`. */
  populatableFields: string[];
  defaultSort?: string;
  maxLimit?: number;
}

/** A single entry in a bulk write. See `BaseRepository.bulkWrite`. */
export type BulkOperation = Record<string, unknown>;

const OPERATOR_MAP: Record<string, string> = {
  eq: '$eq',
  ne: '$ne',
  gt: '$gt',
  gte: '$gte',
  lt: '$lt',
  lte: '$lte',
  in: '$in',
  nin: '$nin',
  exists: '$exists',
};

/**
 * Every repository extends this. Tenant isolation and soft-delete filtering are
 * properties of this class, not of caller discipline — a query that reaches
 * Mongo without a tenant filter on a scoped collection cannot happen by accident.
 */
export abstract class BaseRepository<TDoc> {
  protected readonly model: Model<TDoc>;
  protected readonly config: RepositoryConfig;

  constructor(model: Model<TDoc>, config: Partial<RepositoryConfig> = {}) {
    this.model = model;
    this.config = {
      tenantScoped: true,
      sortableFields: ['createdAt', 'updatedAt'],
      searchableFields: [],
      filterableFields: [],
      populatableFields: [],
      defaultSort: '-createdAt',
      maxLimit: 100,
      ...config,
    };
  }

  get modelName(): string {
    return this.model.modelName;
  }

  /* ------------------------------- scoping -------------------------------- */

  /**
   * Merges the tenant predicate and the soft-delete predicate into a filter.
   * This is the single choke point that makes cross-tenant reads impossible.
   */
  protected scope(filter: FilterQuery<TDoc> = {}): FilterQuery<TDoc> {
    const base = { deletedAt: null, ...filter } as FilterQuery<TDoc>;

    if (!this.config.tenantScoped) return base;

    const context = requestContext.tryGet();
    if (context?.bypassTenantScope) return base;

    const collegeId = context?.collegeId;
    if (!collegeId) {
      throw new InternalError(
        `Tenant context is missing on a scoped query against ${this.model.modelName}.`,
      );
    }

    return { ...base, collegeId: new mongoose.Types.ObjectId(collegeId) } as FilterQuery<TDoc>;
  }

  /** Includes soft-deleted documents. Used by restore and retention paths only. */
  protected scopeWithDeleted(filter: FilterQuery<TDoc> = {}): FilterQuery<TDoc> {
    const scoped = this.scope(filter);
    const { deletedAt: _deletedAt, ...rest } = scoped as Record<string, unknown>;
    return rest as FilterQuery<TDoc>;
  }

  protected tenantId(): mongoose.Types.ObjectId | null {
    const collegeId = requestContext.tryGet()?.collegeId;
    return collegeId ? new mongoose.Types.ObjectId(collegeId) : null;
  }

  /* ------------------------------ query parts ----------------------------- */

  protected buildSort(sort?: string): Record<string, SortOrder> {
    const raw = sort ?? this.config.defaultSort ?? '-createdAt';
    const result: Record<string, SortOrder> = {};

    for (const token of raw.split(',').map((t) => t.trim()).filter(Boolean)) {
      const descending = token.startsWith('-');
      const field = descending ? token.slice(1) : token;

      if (!this.config.sortableFields.includes(field)) {
        throw new ValidationError(`Cannot sort by "${field}".`, [
          {
            field: 'sort',
            message: `Sortable fields: ${this.config.sortableFields.join(', ')}`,
          },
        ]);
      }
      result[field] = descending ? -1 : 1;
    }

    if (Object.keys(result).length === 0) result.createdAt = -1;
    return result;
  }

  protected buildSearch(search?: string): FilterQuery<TDoc> | null {
    if (!search?.trim() || this.config.searchableFields.length === 0) return null;

    // Escaped and anchored: a raw user regex is a ReDoS vector.
    const pattern = new RegExp(`^${escapeRegex(search.trim())}`, 'i');
    const contains = new RegExp(escapeRegex(search.trim()), 'i');

    return {
      $or: this.config.searchableFields.map((field) => ({
        [field]: field.includes('.') ? contains : pattern,
      })),
    } as FilterQuery<TDoc>;
  }

  /**
   * Translates whitelisted query params into Mongo operators.
   * Anything not on `filterableFields` is dropped rather than passed through.
   */
  buildFilterFromQuery(query: Record<string, unknown>): FilterQuery<TDoc> {
    const filter: Record<string, unknown> = {};

    for (const [rawKey, rawValue] of Object.entries(query)) {
      if (rawValue === undefined || rawValue === null || rawValue === '') continue;

      const match = /^(.+?)\[(.+?)\]$/.exec(rawKey);
      const field = match ? (match[1] as string) : rawKey;
      const operator = match ? (match[2] as string) : null;

      if (!this.config.filterableFields.includes(field)) continue;

      if (!operator) {
        filter[field] = this.castValue(field, rawValue);
        continue;
      }

      const mongoOperator = OPERATOR_MAP[operator];
      if (!mongoOperator) continue;

      const value =
        operator === 'in' || operator === 'nin'
          ? String(rawValue)
              .split(',')
              .map((v) => this.castValue(field, v.trim()))
          : this.castValue(field, rawValue);

      filter[field] = { ...(filter[field] as object), [mongoOperator]: value };
    }

    return filter as FilterQuery<TDoc>;
  }

  private castValue(field: string, value: unknown): unknown {
    if (typeof value !== 'string') return value;
    if (field.endsWith('Id') || field.endsWith('Ids')) {
      return mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : value;
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }

  protected buildProjection(fields?: string): ProjectionType<TDoc> | undefined {
    if (!fields?.trim()) return undefined;
    const requested = fields
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f && !f.startsWith('-') && !f.startsWith('$'));
    if (requested.length === 0) return undefined;
    return requested.join(' ') as ProjectionType<TDoc>;
  }

  protected buildPopulate(include?: string): string[] {
    if (!include?.trim()) return [];
    return include
      .split(',')
      .map((f) => f.trim())
      .filter((f) => this.config.populatableFields.includes(f));
  }

  /* -------------------------------- reads --------------------------------- */

  async findById(
    id: string | mongoose.Types.ObjectId,
    options: { session?: ClientSession; include?: string; select?: string } = {},
  ): Promise<TDoc | null> {
    if (!mongoose.isValidObjectId(id)) return null;

    let query = this.model.findOne(this.scope({ _id: id } as FilterQuery<TDoc>));
    if (options.select) query = query.select(options.select);
    if (options.session) query = query.session(options.session);
    for (const path of this.buildPopulate(options.include)) query = query.populate(path);

    return query.exec();
  }

  /** Same as `findById` but throws a 404 rather than returning null. */
  async findByIdOrFail(
    id: string | mongoose.Types.ObjectId,
    options: { session?: ClientSession; include?: string; select?: string } = {},
  ): Promise<TDoc> {
    const doc = await this.findById(id, options);
    // A document in another tenant is indistinguishable from one that does not
    // exist. Returning 403 here would confirm its existence.
    if (!doc) throw new NotFoundError(this.model.modelName);
    return doc;
  }

  async findOne(
    filter: FilterQuery<TDoc>,
    options: { session?: ClientSession; select?: string; include?: string } = {},
  ): Promise<TDoc | null> {
    let query = this.model.findOne(this.scope(filter));
    if (options.select) query = query.select(options.select);
    if (options.session) query = query.session(options.session);
    for (const path of this.buildPopulate(options.include)) query = query.populate(path);
    return query.exec();
  }

  async findMany(
    filter: FilterQuery<TDoc> = {},
    options: { sort?: string; limit?: number; session?: ClientSession; select?: string } = {},
  ): Promise<TDoc[]> {
    let query = this.model.find(this.scope(filter)).sort(this.buildSort(options.sort));
    if (options.limit) query = query.limit(options.limit);
    if (options.select) query = query.select(options.select);
    if (options.session) query = query.session(options.session);
    return query.exec();
  }

  async paginate(options: ListOptions = {}): Promise<PaginatedResult<TDoc>> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(options.limit ?? 25, this.config.maxLimit ?? 100);
    const skip = (page - 1) * limit;

    const search = this.buildSearch(options.search);
    const filter = this.scope({
      ...(options.filter as FilterQuery<TDoc>),
      ...(search ? { $and: [search] } : {}),
    } as FilterQuery<TDoc>);

    let query = this.model
      .find(filter, this.buildProjection(options.fields))
      .sort(this.buildSort(options.sort))
      .skip(skip)
      .limit(limit);

    for (const path of this.buildPopulate(options.include)) query = query.populate(path);
    if (options.session) query = query.session(options.session);

    const [items, totalItems] = await Promise.all([
      query.exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    return {
      items,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Cursor pagination for collections that grow without bound (audit logs,
   * notifications). Deep `skip` on those degrades badly.
   */
  async paginateByCursor(
    options: ListOptions = {},
  ): Promise<{ items: TDoc[]; pagination: PaginationMeta }> {
    const limit = Math.min(options.limit ?? 25, this.config.maxLimit ?? 100);
    const cursorFilter: Record<string, unknown> = {};

    if (options.cursor && mongoose.isValidObjectId(options.cursor)) {
      cursorFilter._id = { $lt: new mongoose.Types.ObjectId(options.cursor) };
    }

    const filter = this.scope({
      ...(options.filter as FilterQuery<TDoc>),
      ...cursorFilter,
    } as FilterQuery<TDoc>);

    const items = await this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .exec();

    const hasNextPage = items.length > limit;
    const page = hasNextPage ? items.slice(0, limit) : items;
    const last = page[page.length - 1] as { _id?: mongoose.Types.ObjectId } | undefined;

    return {
      items: page,
      pagination: {
        page: 1,
        limit,
        totalItems: page.length,
        totalPages: 1,
        hasNextPage,
        hasPreviousPage: Boolean(options.cursor),
        nextCursor: hasNextPage && last?._id ? String(last._id) : null,
      },
    };
  }

  async count(filter: FilterQuery<TDoc> = {}): Promise<number> {
    return this.model.countDocuments(this.scope(filter)).exec();
  }

  async exists(filter: FilterQuery<TDoc>): Promise<boolean> {
    const found = await this.model.exists(this.scope(filter));
    return found !== null;
  }

  async distinct<T = string>(field: string, filter: FilterQuery<TDoc> = {}): Promise<T[]> {
    return this.model.distinct(field, this.scope(filter)).exec() as Promise<T[]>;
  }

  /* -------------------------------- writes -------------------------------- */

  async create(data: Partial<TDoc>, session?: ClientSession): Promise<TDoc> {
    const payload = { ...data } as Record<string, unknown>;

    if (this.config.tenantScoped && !payload.collegeId) {
      const tenant = this.tenantId();
      if (!tenant) {
        throw new InternalError(
          `Cannot create a ${this.model.modelName} without a tenant context.`,
        );
      }
      payload.collegeId = tenant;
    }

    const [doc] = await this.model.create([payload], { session, ordered: true });
    if (!doc) throw new InternalError(`Failed to create ${this.model.modelName}.`);
    return doc;
  }

  async createMany(items: Array<Partial<TDoc>>, session?: ClientSession): Promise<TDoc[]> {
    const tenant = this.tenantId();
    const payload = items.map((item) => {
      const record = { ...item } as Record<string, unknown>;
      if (this.config.tenantScoped && !record.collegeId && tenant) record.collegeId = tenant;
      return record;
    });

    /**
     * Unordered inserts run in parallel, which a single session cannot serve —
     * Mongoose rejects the call outright. Inside a transaction the whole batch
     * succeeds or rolls back together anyway, so ordering costs nothing there.
     */
    return this.model.create(payload, {
      session,
      ordered: session ? true : false,
    }) as unknown as Promise<TDoc[]>;
  }

  async updateById(
    id: string | mongoose.Types.ObjectId,
    update: UpdateQuery<TDoc>,
    options: QueryOptions & { session?: ClientSession } = {},
  ): Promise<TDoc | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    return this.model
      .findOneAndUpdate(this.scope({ _id: id } as FilterQuery<TDoc>), update, {
        new: true,
        runValidators: true,
        ...options,
      })
      .exec();
  }

  async updateByIdOrFail(
    id: string | mongoose.Types.ObjectId,
    update: UpdateQuery<TDoc>,
    options: QueryOptions & { session?: ClientSession } = {},
  ): Promise<TDoc> {
    const doc = await this.updateById(id, update, options);
    if (!doc) throw new NotFoundError(this.model.modelName);
    return doc;
  }

  async updateOne(
    filter: FilterQuery<TDoc>,
    update: UpdateQuery<TDoc>,
    options: QueryOptions & { session?: ClientSession } = {},
  ): Promise<TDoc | null> {
    return this.model
      .findOneAndUpdate(this.scope(filter), update, {
        new: true,
        runValidators: true,
        ...options,
      })
      .exec();
  }

  async updateMany(
    filter: FilterQuery<TDoc>,
    update: UpdateQuery<TDoc>,
    session?: ClientSession,
  ): Promise<number> {
    const result = await this.model.updateMany(this.scope(filter), update, { session }).exec();
    return result.modifiedCount;
  }

  /**
   * Mongoose parameterises bulk operations on `Document`, which our plain
   * document interfaces deliberately do not extend, so the operation list is
   * typed loosely here and narrowed by the caller.
   */
  async bulkWrite(
    operations: BulkOperation[],
    session?: ClientSession,
  ): Promise<mongoose.mongo.BulkWriteResult> {
    return this.model.bulkWrite(
      operations as unknown as Parameters<Model<TDoc>['bulkWrite']>[0],
      { session, ordered: false },
    );
  }

  /* ----------------------------- soft delete ------------------------------ */

  async softDelete(
    id: string | mongoose.Types.ObjectId,
    session?: ClientSession,
  ): Promise<TDoc | null> {
    const userId = requestContext.tryGet()?.userId;
    return this.updateById(
      id,
      {
        $set: {
          deletedAt: new Date(),
          deletedBy: userId ? new mongoose.Types.ObjectId(userId) : null,
        },
      } as UpdateQuery<TDoc>,
      { session },
    );
  }

  async softDeleteMany(
    ids: Array<string | mongoose.Types.ObjectId>,
    session?: ClientSession,
  ): Promise<number> {
    const userId = requestContext.tryGet()?.userId;
    return this.updateMany(
      { _id: { $in: ids } } as FilterQuery<TDoc>,
      {
        $set: {
          deletedAt: new Date(),
          deletedBy: userId ? new mongoose.Types.ObjectId(userId) : null,
        },
      } as UpdateQuery<TDoc>,
      session,
    );
  }

  async restore(id: string | mongoose.Types.ObjectId): Promise<TDoc | null> {
    return this.model
      .findOneAndUpdate(
        this.scopeWithDeleted({ _id: id } as FilterQuery<TDoc>),
        { $set: { deletedAt: null, deletedBy: null } } as UpdateQuery<TDoc>,
        { new: true },
      )
      .exec();
  }

  /** Hard delete is not exposed over the API; retention jobs use it. */
  async hardDelete(filter: FilterQuery<TDoc>, session?: ClientSession): Promise<number> {
    const result = await this.model.deleteMany(this.scopeWithDeleted(filter), { session }).exec();
    return result.deletedCount ?? 0;
  }

  /* ------------------------------ aggregation ----------------------------- */

  /** Prepends a tenant `$match` so pipelines cannot leak across colleges. */
  async aggregate<TResult = Record<string, unknown>>(
    pipeline: PipelineStage[],
    session?: ClientSession,
  ): Promise<TResult[]> {
    const match: Record<string, unknown> = { deletedAt: null };

    if (this.config.tenantScoped) {
      const context = requestContext.tryGet();
      if (!context?.bypassTenantScope) {
        const tenant = this.tenantId();
        if (!tenant) {
          throw new InternalError(
            `Tenant context is missing on an aggregation against ${this.model.modelName}.`,
          );
        }
        match.collegeId = tenant;
      }
    }

    return this.model
      .aggregate<TResult>([{ $match: match }, ...pipeline])
      .session(session ?? null)
      .exec();
  }
}
