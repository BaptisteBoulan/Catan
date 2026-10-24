import type { PlayerDto } from '../../game/api-types'

export function PlayerAwards({ player, showKnights }: { player: PlayerDto, showKnights: boolean }) {
  return <>
    {player.hasLongestRoad && (
      <span className="longest-road-badge" title="Longest road: +2 victory points">Longest road</span>
    )}
    {player.hasLargestArmy && (
      <span className="largest-army-badge" title="Largest army: +2 victory points">♞ Largest army</span>
    )}
    {showKnights && player.knightsPlayed > 0 && (
      <span className="knight-progress" role="img"
        aria-label={`${player.knightsPlayed} Knights played`}
        title={`${player.knightsPlayed} Knights played; 3 needed for Largest Army`}>
        {'♞'.repeat(player.knightsPlayed)}
      </span>
    )}
  </>
}
