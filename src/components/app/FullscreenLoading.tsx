import type { JobProgressSnapshot } from "../../types/jobProgress";

type FullscreenLoadingProps = {
  progress: JobProgressSnapshot;
  visible: boolean;
};

export function FullscreenLoading({
  progress,
  visible,
}: FullscreenLoadingProps) {
  if (!visible) {
    return null;
  }

  const progressWidth = `${Math.max(0, Math.min(progress.percent, 100))}%`;

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-orbit-bg/95 backdrop-blur-[2px]">
      <div className="w-full max-w-sm px-8">
        <div className="h-0.75 overflow-hidden border border-orbit-border bg-orbit-bg">
          <div
            className="h-full bg-orbit-accent transition-[width] duration-300"
            style={{ width: progressWidth }}
          />
        </div>
      </div>
    </div>
  );
}
