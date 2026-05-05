import { type Status } from '../api/documents';

const CONFIG: Record<Status, { label: string; className: string }> = {
  ready: { label: 'Ready', className: 'bg-green-100 text-green-800' },
  processing: { label: 'Processing', className: 'bg-blue-100 text-blue-800' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-800' },
  purging: { label: 'Purging', className: 'bg-orange-100 text-orange-800' },
  purged: { label: 'Purged', className: 'bg-gray-100 text-gray-400' },
};

export default function StatusBadge({ status }: { status: Status }) {
  const { label, className } = CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
