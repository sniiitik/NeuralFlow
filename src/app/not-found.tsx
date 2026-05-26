import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[#928dff]">404</p>
      <h1 className="mt-4 text-4xl font-bold text-[#f5f3ed]">Page not found</h1>
      <p className="mt-3 max-w-md text-[#bebbb1]">The NeuralFlow route you requested does not exist.</p>
      <Link
        href="/"
        className="mt-8 rounded-2xl border border-white/10 bg-[#6457f6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#756bff]"
      >
        Back to overview
      </Link>
    </div>
  );
}
