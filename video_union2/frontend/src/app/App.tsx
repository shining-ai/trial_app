import { DownloadLink } from "../features/download/DownloadLink";
import { checkMergeable } from "../features/merge/checkMergeable";
import { MergeButton } from "../features/merge/MergeButton";
import { MergeProgress } from "../features/merge/MergeProgress";
import { MergeSummary } from "../features/merge/MergeSummary";
import { useMergeJob } from "../features/merge/useMergeJob";
import { useMergeQueue } from "../features/merge/useMergeQueue";
import { VideoOrderList } from "../features/merge/VideoOrderList";
import { UploadForm } from "../features/upload/UploadForm";
import { UploadList } from "../features/upload/UploadList";
import { useUploadQueue } from "../features/upload/useUploadQueue";

export function App() {
  const mergeQueue = useMergeQueue();
  const mergeJob = useMergeJob();
  const uploadQueue = useUploadQueue({
    mergeCount: mergeQueue.videoCount,
    onUploaded: (video) => mergeQueue.addItem({ ...video, kind: "video" }),
  });
  const check = checkMergeable({
    videoCount: mergeQueue.videoCount,
    itemCount: mergeQueue.items.length,
    totalSeconds: mergeQueue.totalSeconds,
    isMerging: mergeJob.isMerging,
    isEditing: mergeQueue.editor !== null,
  });

  return (
    <main>
      <h1>動画結合アプリ</h1>
      <section aria-label="アップロード">
        <UploadForm
          remainingSlots={uploadQueue.remainingSlots}
          showLimitNotice={uploadQueue.limitExceeded}
          onSelect={uploadQueue.addFiles}
        />
        <UploadList items={uploadQueue.items} />
      </section>
      <section aria-label="結合">
        <VideoOrderList
          items={mergeQueue.items}
          disabled={mergeJob.isMerging}
          deleteError={mergeQueue.deleteError}
          onMove={mergeQueue.move}
          onRemove={(id) => void mergeQueue.removeItem(id)}
        />
        <MergeSummary totalSeconds={mergeQueue.totalSeconds} excessSeconds={check.excessSeconds} />
        <MergeButton
          check={check}
          rejectMessage={mergeJob.rejectMessage}
          onMerge={() => void mergeJob.start(mergeQueue.items)}
        />
        <MergeProgress job={mergeJob.job} />
        {mergeJob.job?.status === "succeeded" ? <DownloadLink jobId={mergeJob.job.id} /> : null}
      </section>
    </main>
  );
}
