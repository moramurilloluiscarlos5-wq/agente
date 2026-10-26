import { useSectionHelp } from '../../hooks/useSectionHelp.js'
import { SectionHelpButton, SectionHelpPanel } from './SectionHelp.jsx'

export default function PageHeader({ title, description, actions }) {
  const help = useSectionHelp()
  return (
    <div className="ct-page-intro">
      <header className="ct-page-header">
        <div className="min-w-0">
          <h1 className="ct-page-title">{title}</h1>
          {description && <p className="ct-page-description">{description}</p>}
        </div>
        {(actions || help.help) && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2"><SectionHelpButton {...help} />{actions}</div>}
      </header>
      <SectionHelpPanel {...help} />
    </div>
  )
}
