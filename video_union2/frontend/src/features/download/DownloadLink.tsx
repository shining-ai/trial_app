export function DownloadLink({ jobId }: { jobId: string }) {
  return (
    <div className="download">
      <span>結合が完了しました</span>
      <a className="btn btn--primary download__link" href={`/api/merges/${jobId}/download`}>
        ダウンロード
      </a>
    </div>
  );
}
