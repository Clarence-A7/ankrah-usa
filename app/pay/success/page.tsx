import { Suspense } from "react";
import PaySuccessClient from "./PaySuccessClient";

export default function PaySuccessPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>
      }
    >
      <PaySuccessClient />
    </Suspense>
  );
}
