/* Photo or placeholder. size = "big" or "thumb" */
export function Photo({ src, size = 'thumb' }) {
  if (src) {
    return <img src={src} alt="" className={size === 'big' ? 'photo-big' : 'photo-thumb'} />
  }

  return (
    <div className={size === 'big' ? 'photo-big-placeholder' : 'photo-thumb-placeholder'}>
      <div className={size === 'big' ? 'photo-line-big' : 'photo-line-small'} />
    </div>
  )
}
