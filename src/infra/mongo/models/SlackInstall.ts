import mongoose, { Schema, type Document } from 'mongoose';

export interface SlackInstallDocument extends Document {
  tenantId: mongoose.Types.ObjectId;
  teamId: string;
  teamName: string;
  botToken: string;
  botUserId: string;
  installedAt: Date;
}

const slackInstallSchema = new Schema<SlackInstallDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    teamId: { type: String, required: true, unique: true, index: true },
    teamName: { type: String, required: true },
    botToken: { type: String, required: true },
    botUserId: { type: String, required: true },
    installedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const SlackInstallModel =
  (mongoose.models['SlackInstall'] as mongoose.Model<SlackInstallDocument>) ??
  mongoose.model<SlackInstallDocument>('SlackInstall', slackInstallSchema);
