import { COMPANY_STATUS, COMPANY_TYPE, type CompanyStatus, type CompanyType } from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface CompanyContact {
  name: string;
  designation: string;
  email: string;
  phone: string;
  isPrimary: boolean;
}

export interface CompanyDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  name: string;
  /** Registered entity, where it differs from the trading name. */
  legalName: string | null;
  /** Lowercased name, for the unique index — "Acme" and "ACME" are one company. */
  nameKey: string;
  logoUrl: string | null;
  /** Storage key, kept so a replacement can delete the old object. */
  logoKey: string | null;
  website: string | null;
  industry: string;
  companyType: CompanyType;
  sizeRange: string | null;
  headquarters: string | null;
  locations: string[];
  description: string | null;
  email: string | null;
  phone: string | null;
  contacts: CompanyContact[];

  isVerified: boolean;
  verifiedAt: Date | null;
  verifiedBy: Types.ObjectId | null;
  verificationNote: string | null;

  status: CompanyStatus;
  blacklistReason: string | null;
  blacklistedAt: Date | null;
  blacklistedBy: Types.ObjectId | null;

  /** Denormalised so a company list does not aggregate on every render. */
  stats: {
    jobCount: number;
    activeJobCount: number;
    applicationCount: number;
    offerCount: number;
    lastDriveAt: Date | null;
  };
}

const contactSchema = new Schema<CompanyContact>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    designation: { type: String, default: '', trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false },
);

const companySchema = new Schema<CompanyDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  legalName: { type: String, default: null, trim: true, maxlength: 240 },
  nameKey: { type: String, required: true, lowercase: true, trim: true, maxlength: 200 },
  logoUrl: { type: String, default: null },
  logoKey: { type: String, default: null },
  website: { type: String, default: null, trim: true, maxlength: 300 },
  industry: { type: String, required: true, trim: true, maxlength: 120 },
  companyType: { type: String, enum: COMPANY_TYPE, required: true },
  sizeRange: { type: String, default: null, trim: true, maxlength: 40 },
  headquarters: { type: String, default: null, trim: true, maxlength: 160 },
  locations: { type: [String], default: [] },
  description: { type: String, default: null, maxlength: 5000 },
  email: { type: String, default: null, lowercase: true, trim: true, maxlength: 254 },
  phone: { type: String, default: null, trim: true, maxlength: 20 },
  contacts: { type: [contactSchema], default: [] },

  isVerified: { type: Boolean, default: false },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  verificationNote: { type: String, default: null, maxlength: 500 },

  status: { type: String, enum: COMPANY_STATUS, default: 'active' },
  blacklistReason: { type: String, default: null, maxlength: 1000 },
  blacklistedAt: { type: Date, default: null },
  blacklistedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

  stats: {
    jobCount: { type: Number, default: 0, min: 0 },
    activeJobCount: { type: Number, default: 0, min: 0 },
    applicationCount: { type: Number, default: 0, min: 0 },
    offerCount: { type: Number, default: 0, min: 0 },
    lastDriveAt: { type: Date, default: null },
  },
});

applyBasePlugin(companySchema);
applyToJsonTransform(companySchema);

/**
 * Unique on the folded name rather than the display name: a college that has
 * "Infosys" must not end up with "infosys" and "INFOSYS" as separate records,
 * each holding half the drive history.
 */
companySchema.index(
  { collegeId: 1, nameKey: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
companySchema.index({ collegeId: 1, status: 1, isVerified: 1 });
companySchema.index({ collegeId: 1, industry: 1 });
companySchema.index({ collegeId: 1, companyType: 1 });
companySchema.index({ collegeId: 1, 'stats.lastDriveAt': -1 });
// Backs the free-text search on the list.
companySchema.index({ collegeId: 1, name: 'text', industry: 'text' });

companySchema.pre('validate', function (next) {
  if (this.name) this.nameKey = this.name.trim().toLowerCase();
  next();
});

export const CompanyModel = (mongoose.models.Company as Model<CompanyDocument>) ??
  mongoose.model<CompanyDocument>('Company', companySchema);
