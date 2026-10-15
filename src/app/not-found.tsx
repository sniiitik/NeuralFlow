import Link from "next/link";
export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-xs muted">404</p>
      <h1 className="mt-3 text-2xl font-semibold">Page not found</h1>
      <p className="mt-3 muted">This workspace page does not exist.</p>
      <Link href="/" className="btn mt-6">
        Back to overview
      </Link>
    </div>
  );
}
