import Link from "next/link";

const PENT = "12,7.8 15.99,10.7 14.47,15.4 9.53,15.4 8.01,10.7";
const SPOKES: [number, number, number, number][] = [
  [12, 7.8, 12, 1],
  [15.99, 10.7, 22.46, 8.6],
  [14.47, 15.4, 18.47, 20.9],
  [9.53, 15.4, 5.53, 20.9],
  [8.01, 10.7, 1.54, 8.6],
];
const PATCHES: [number, number][] = [
  [12, -1],
  [24.4, 7.9],
  [19.6, 22.5],
  [4.4, 22.5],
  [-0.4, 7.9],
];

/** A classic black-and-white ball, drawn inline so there is no image request. */
export function Football({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <clipPath id="ballclip">
          <circle cx="12" cy="12" r="11" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="11" fill="#f4fbf6" />
      <g clipPath="url(#ballclip)" fill="#0b2117" stroke="#0b2117" strokeWidth="0.9">
        <polygon points={PENT} />
        {SPOKES.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeLinecap="round" />
        ))}
        {PATCHES.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="3.4" stroke="none" />
        ))}
      </g>
      <circle cx="12" cy="12" r="11" fill="none" stroke="#245239" strokeWidth="1.2" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5">
      <Football className="h-8 w-8 transition-transform duration-300 group-hover:rotate-180" />
      <span className="font-display text-xl uppercase tracking-wide">
        Football<span className="text-turf">dex</span>
      </span>
    </Link>
  );
}
