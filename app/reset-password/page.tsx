import ResetForm from "./ResetForm";

// Server component: reads the one-time token from the emailed link and hands it
// to the client form. (searchParams is async in this Next version.)
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <ResetForm token={token ?? ""} />;
}
