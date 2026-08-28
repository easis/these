export type ListDownloadStatus = "selected" | "maybe" | "all";

export function startListDownload(listId: number, status: ListDownloadStatus) {
  const link = document.createElement("a");
  link.href = `/api/lists/${listId}/download?status=${status}`;
  document.body.append(link);
  link.click();
  link.remove();
}

export function startMediaDownload(path: string, name: string) {
  const link = document.createElement("a");
  link.href = `/api/media?${new URLSearchParams({ path })}`;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
}
