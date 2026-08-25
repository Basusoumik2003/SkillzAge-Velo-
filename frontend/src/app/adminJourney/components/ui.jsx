"use client";

// Shared presentational primitives for the admin journey dashboard. Pure UI —
// no data fetching or business logic lives here, so every tab component can
// import from one place without pulling in unrelated state.

export const inputClass =
  "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:bg-white";

export const inputClassCompact =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-orange-400";

export function FieldLabel({ children }) {
  return (
    <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">
      {children}
    </span>
  );
}

const STAT_TONES = {
  slate: { border: "border-slate-200", bg: "bg-white", icon: "bg-slate-100 text-slate-600", value: "text-slate-950" },
  orange: { border: "border-orange-100", bg: "bg-white", icon: "bg-orange-50 text-orange-600", value: "text-slate-950" },
  blue: { border: "border-blue-100", bg: "bg-white", icon: "bg-blue-50 text-blue-600", value: "text-slate-950" },
  emerald: { border: "border-emerald-100", bg: "bg-white", icon: "bg-emerald-50 text-emerald-600", value: "text-slate-950" },
  purple: { border: "border-violet-100", bg: "bg-white", icon: "bg-violet-50 text-violet-600", value: "text-slate-950" },
  rose: { border: "border-rose-100", bg: "bg-white", icon: "bg-rose-50 text-rose-600", value: "text-slate-950" },
  teal: { border: "border-teal-100", bg: "bg-white", icon: "bg-teal-50 text-teal-600", value: "text-slate-950" }
};

export function StatTile({ label, value, detail, tone = "slate", icon: Icon }) {
  const toneClasses = STAT_TONES[tone] || STAT_TONES.slate;

  return (
    <article className={`rounded-[1.5rem] border ${toneClasses.border} ${toneClasses.bg} p-5 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.35)]`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-black text-slate-950">{value}</p>
          <p className="mt-1 truncate text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
          {detail ? <p className="mt-1 text-xs font-semibold text-slate-400">{detail}</p> : null}
        </div>

        {Icon ? (
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${toneClasses.icon}`}>
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
      </div>
    </article>
  );
}

export function Panel({ title, description, icon: Icon, actions, children }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {Icon ? (
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-50 text-orange-600">
              <Icon className="h-5 w-5" />
            </span>
          ) : null}

          <div>
            <h3 className="text-xl font-black text-slate-950 sm:text-2xl">{title}</h3>
            {description ? <p className="mt-1 text-sm font-semibold text-slate-500">{description}</p> : null}
          </div>
        </div>

        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>

      <div className="mt-6">{children}</div>
    </section>
  );
}

export function EmptyState({ children }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
      {children}
    </p>
  );
}

export function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-200 text-slate-600",
    rose: "bg-rose-100 text-rose-600",
    orange: "bg-orange-100 text-orange-700",
    emerald: "bg-emerald-100 text-emerald-700"
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
}

// Simple dependency-free donut chart built from stacked SVG arcs — avoids
// pulling in a charting library just for one ring on the dashboard tab.
export function DonutChart({ segments, size = 168, thickness = 22, centerLabel, centerValue }) {
  const total = segments.reduce((sum, segment) => sum + (Number(segment.value) || 0), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
          {total > 0
            ? segments.map((segment) => {
                const value = Number(segment.value) || 0;
                if (!value) return null;
                const fraction = value / total;
                const dash = fraction * circumference;
                const circle = (
                  <circle
                    key={segment.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={thickness}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offset}
                    strokeLinecap={segments.length > 1 ? "butt" : "round"}
                  />
                );
                offset += dash;
                return circle;
              })
            : null}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-black text-slate-950">{centerValue}</p>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{centerLabel}</p>
        </div>
      </div>

      <ul className="grid gap-2.5">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
            <span className="font-bold text-slate-700">{segment.label}</span>
            <span className="font-semibold text-slate-400">
              {segment.value} {total ? `(${Math.round((segment.value / total) * 100)}%)` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
