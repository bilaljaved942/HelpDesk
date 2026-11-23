import { AuthProvider } from "@/components/AuthProvider";

export const metadata = { title: { default: "Staff", template: "%s · HelpDesk Agent" } };

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
