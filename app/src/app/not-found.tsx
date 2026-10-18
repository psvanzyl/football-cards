import Link from "next/link";
import { Football } from "@/components/Ball";

export default function NotFound() {
  return (
    <div className="rise mx-auto max-w-lg py-20 text-center">
      <Football className="mx-auto h-16 w-16" />
      <h1 className="mt-5 font-display text-4xl uppercase">Off target</h1>
      <p className="mt-2 text-[13px] text-muted">
        That page, player or team is not in the catalogue. The ball went wide.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-full border border-turf/50 bg-turf/10 px-5 py-2 text-[13px] text-turf hover:bg-turf/20"
      >
        Back to the catalogue
      </Link>
    </div>
  );
}
