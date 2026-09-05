import { c, s } from '../styles'

export function Button({ children, variant = 'solid', onClick }) {
  return (
    <button onClick={onClick} style={{
      ...s.button,
      background: variant === 'solid' ? c.accent : 'transparent',
      border: variant === 'solid' ? 'none' : `1px solid ${c.border2}`,
      color: variant === 'solid' ? '#fff' : c.muted,
    }}>
      {children}
    </button>
  )
}