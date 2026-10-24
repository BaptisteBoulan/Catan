import type { PlacementKind } from './api-types'

export function placementPath(kind: PlacementKind): string {
  return kind === 'thief' ? 'thief' : `build/${kind}`
}


export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, options)
  if (!response.ok) {
    const body: { detail?: unknown } = await response.json()
    throw new Error(typeof body.detail === 'string'
      ? body.detail
      : `Request failed: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}
