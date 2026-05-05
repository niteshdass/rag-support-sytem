import { Link } from 'react-router-dom';
import { type Document } from '../api/documents';
import VisibilityBadge from './VisibilityBadge';
import StatusBadge from './StatusBadge';

interface Props {
  doc: Document;
  onView: () => void;
  onChangeVisibility: () => void;
  onDelete: () => void;
}

export default function DocumentRow({ doc, onView, onChangeVisibility, onDelete }: Props) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="max-w-xs px-4 py-3">
        <Link
          to={`/documents/${doc._id}`}
          className="block truncate font-medium text-gray-900 hover:text-indigo-600"
          title={doc.title}
        >
          {doc.title}
        </Link>
        {doc.url && (
          <span className="block truncate text-xs text-gray-400" title={doc.url}>
            {doc.url}
          </span>
        )}
      </td>
      <td className="px-4 py-3 capitalize text-gray-600 text-sm">{doc.sourceType}</td>
      <td className="px-4 py-3">
        <VisibilityBadge visibility={doc.visibility} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={doc.status} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
        {new Date(doc.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onView}
            disabled={!doc.url}
            className="text-xs text-gray-600 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-30"
          >
            View
          </button>
          <button
            onClick={onChangeVisibility}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            Visibility
          </button>
          <button onClick={onDelete} className="text-xs text-red-600 hover:text-red-800">
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
