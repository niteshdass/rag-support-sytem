interface Props {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

export default function DeleteConfirmDialog({ title, onConfirm, onCancel, isPending }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-gray-900">Delete document?</h2>
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-medium">{title}</span> will be permanently removed from vectors,
          search index, and cache. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
