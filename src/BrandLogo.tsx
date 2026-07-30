import { Link } from 'react-router-dom'

type BrandLogoProps = {
  to?: string
  href?: string
  label?: string
}

export function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      M
    </span>
  )
}

export function BrandLogo({ to = '/', href, label = 'Mandate home' }: BrandLogoProps) {
  const content = (
    <>
      <LogoMark />
      mandate
    </>
  )

  if (href) {
    return (
      <a className="logo" href={href} aria-label={label}>
        {content}
      </a>
    )
  }

  return (
    <Link className="logo" to={to} aria-label={label}>
      {content}
    </Link>
  )
}
