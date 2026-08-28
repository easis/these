import { Folder } from "lucide-react";

export function CollectionMark({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      <Folder size={18} fill="currentColor" fillOpacity={0.08} />
      <Folder size={18} fill="currentColor" fillOpacity={0.12} />
      <Folder size={18} fill="currentColor" fillOpacity={0.16} />
    </span>
  );
}
