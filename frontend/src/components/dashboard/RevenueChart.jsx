export default function RevenueChart({ data }) {
  const maxValue = Math.max(...data.map((point) => point.value), 1)

  return (
    <div className="flex h-48 items-end gap-3">
      {data.map((point) => (
        <div key={point.label} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex h-36 w-full items-end overflow-hidden rounded-t-md bg-slate-800/40">
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-blue-600 to-cyan-400"
              style={{ height: `${(point.value / maxValue) * 100}%` }}
            />
          </div>
          <span className="text-xs text-slate-500">{point.label}</span>
        </div>
      ))}
    </div>
  )
}
