export function Input({ placeholder, value, onChange, mono = false }) {
  return (
    <input
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      style={{
        height: '29px',
        background: '#262930',
        border: '1px solid #2c2f38',
        borderRadius: '2px',
        color: '#d0d4de',
        fontSize: '12px',
        padding: '0 10px',
        fontFamily: mono ? "'Courier New', monospace" : 'inherit',
        outline: 'none',
        width: '100%',
      }}
    />
  )
}