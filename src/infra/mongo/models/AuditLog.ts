import mongoose, { Schema, type Document } from 'mongoose';

export interface AuditLog extends Document {
  tenantId: mongoose.Types.ObjectId;
  actor: mongoose.Types.ObjectId;
  action: string;
  target: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

const auditLogSchema = new Schema<AuditLog>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    actor: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, required: true },
    target: { type: String, required: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

auditLogSchema.index({ tenantId: 1, createdAt: -1 });

export const AuditLogModel =
  (mongoose.models['AuditLog'] as mongoose.Model<AuditLog>) ??
  mongoose.model<AuditLog>('AuditLog', auditLogSchema);
