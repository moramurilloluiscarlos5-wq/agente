export default function PlaceholderPage({ icon: Icon, title, description, phase }) {
  return (
    <div className="ct-empty flex min-h-[24rem] flex-col items-center justify-center px-6 py-16">
      {Icon && (
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-cyan-300">
          <Icon size={20} strokeWidth={1.8} />
        </span>
      )}
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
      {phase && (
        <span className="mt-4 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
          Disponible en la {phase}
        </span>
      )}
    </div>
  )
}
