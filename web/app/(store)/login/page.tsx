import { Suspense } from "react";
import { CustomerAuth } from "@/components/store/Account";

export const metadata = { title: "Log in" };

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-[50vh]" />}>
      <CustomerAuth mode="login" />
    </Suspense>
  );
}
