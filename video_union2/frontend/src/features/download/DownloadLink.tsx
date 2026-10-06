export function DownloadLink({ jobId }: { jobId: string }) {
  return <a href={`/api/merges/${jobId}/download`}>ダウンロード</a>;
}
