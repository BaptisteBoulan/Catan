const DIE_PIPS = [
  [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8],
]


export function Dice({ values, total }: { values: [number, number], total: number }) {
  return (
    <div className="dice-result" role="img"
      aria-label={`Dice: ${values[0]} and ${values[1]}, total ${total}`}>
      {values.map((value, index) => (
        <svg key={index} className="die-face" viewBox="0 0 30 30" aria-hidden="true">
          <rect x="1" y="1" width="28" height="28" rx="5" />
          {DIE_PIPS[value - 1].map((pip) => (
            <circle key={pip} cx={7 + (pip % 3) * 8} cy={7 + Math.floor(pip / 3) * 8} r="2.2" />
          ))}
        </svg>
      ))}
      <strong aria-hidden="true">= {total}</strong>
    </div>
  )
}
