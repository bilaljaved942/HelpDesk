import { Suspense } from "react";
import { ProductDetail } from "@/components/store/ProductDetail";

export const metadata = { title: "Product" };

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto h-[520px] max-w-6xl animate-pulse px-4 py-10 sm:px-6" />}>
      <ProductDetail />
    </Suspense>
  );
}
