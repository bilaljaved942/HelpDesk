import { Suspense } from "react";
import { HelpIndex } from "@/components/store/Help";

export const metadata = { title: "Help center" };

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-[50vh]" />}>
      <HelpIndex />
    </Suspense>
  );
}
