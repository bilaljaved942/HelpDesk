import { Suspense } from "react";
import { CustomerAuth } from "@/components/store/Account";

export const metadata = { title: "Create an account" };

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-[50vh]" />}>
      <CustomerAuth mode="signup" />
    </Suspense>
  );
}
