export default function PlaceholderPage({ icon: Icon, title, description, phase }) {
  return (
    <div className="ct-empty flex min-h-[20rem] flex-col items-center justify-center px-6">
      {Icon && (
        <span className="mb-4 text-slate-500">
          <Icon size={20} strokeWidth={1.8} />
        </span>
      )}
      <h2 className="text-base font-semibold text-slate-100">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
      {phase && (
        <span className="mt-4 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300">
          Disponible en la {phase}
        </span>
      )}
    </div>
  )
}
