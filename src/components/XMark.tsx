// The x9 mark, used wherever the old "§" section marker was. Plain <img> (no hooks) so it works in
// server and client components; multiply blend drops the PNG's cream backdrop on light surfaces.
export default function XMark({ size = '1.15em' }: { size?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/x9labs-mark.png"
      alt=""
      aria-hidden="true"
      style={{ height: size, width: 'auto', display: 'inline-block', verticalAlign: '-0.2em', marginRight: '.25em', mixBlendMode: 'multiply' }}
    />
  )
}
