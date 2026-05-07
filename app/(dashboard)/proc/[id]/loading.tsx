import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-sm text-gray-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>Loading PROC</span>
      </div>
    </div>
  );
}
