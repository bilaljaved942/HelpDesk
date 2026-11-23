import { Suspense } from "react";
import { Inbox } from "@/components/Inbox";

export const metadata = { title: "Inbox · HelpDesk Agent" };

export default function Page() {
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}
