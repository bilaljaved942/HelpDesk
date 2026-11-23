import { Suspense } from "react";
import { Checkout } from "@/components/store/Checkout";

export const metadata = { title: "Checkout" };

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-[50vh]" />}>
      <Checkout />
    </Suspense>
  );
}
