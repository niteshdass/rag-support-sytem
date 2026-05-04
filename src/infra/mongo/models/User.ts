import bcrypt from 'bcryptjs';
import mongoose, { Schema, type Document, type Model } from 'mongoose';
import { z } from 'zod';
import {
  tenantScopePlugin,
  type WithTenantScope,
} from '../plugins/tenantScope.js';

export const UserCreateSchema = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'agent']),
  name: z.string().min(1),
});

export const UserUpdateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['admin', 'agent']).optional(),
  name: z.string().min(1).optional(),
});

export type UserCreate = z.infer<typeof UserCreateSchema>;
export type UserUpdate = z.infer<typeof UserUpdateSchema>;

export interface UserDocument extends Document {
  tenantId: mongoose.Types.ObjectId;
  email: string;
  passwordHash: string;
  role: 'admin' | 'agent';
  name: string;
  comparePassword(plain: string): Promise<boolean>;
}

const userSchema = new Schema<UserDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    email: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'agent'], required: true },
    name: { type: String, required: true },
  },
  { timestamps: true },
);

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.plugin(tenantScopePlugin);

userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});

userSchema.methods.comparePassword = function (plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.passwordHash);
};

export const UserModel: WithTenantScope<UserDocument> = (
  mongoose.models['User'] ?? mongoose.model<UserDocument>('User', userSchema)
) as WithTenantScope<UserDocument>;
