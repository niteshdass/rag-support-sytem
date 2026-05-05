import { type Visibility } from '../api/documents';

const CONFIG: Record<Visibility, { label: string; className: string }> = {
  'customer-facing': { label: 'Customer-facing', className: 'bg-green-100 text-green-800' },
  internal: { label: 'Internal', className: 'bg-amber-100 text-amber-800' },
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-500' },
};

export default function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  const { label, className } = CONFIG[visibility];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
