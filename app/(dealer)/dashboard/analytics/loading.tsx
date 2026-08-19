function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800 ${className}`} />;
}

function KpiSkeleton() {
  return (
    <div className="border-border-default bg-background rounded-lg border p-5 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export default function AnalyticsLoading() {
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-9 w-48" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-3 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      </div>

      <div className="border-border-default bg-background rounded-lg border p-5">
        <Skeleton className="mb-4 h-4 w-32" />
        <Skeleton className="h-56 w-full" />
      </div>

      <div className="border-border-default bg-background rounded-lg border p-5">
        <Skeleton className="mb-4 h-4 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
