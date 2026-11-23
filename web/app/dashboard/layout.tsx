import { Suspense } from "react";
import { AuthProvider } from "@/components/AuthProvider";
import { DashboardShell } from "@/components/DashboardShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Suspense fallback={<div className="min-h-screen" />}>
        <DashboardShell>{children}</DashboardShell>
      </Suspense>
    </AuthProvider>
  );
}
