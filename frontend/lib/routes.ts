import type { ScreenType } from '../types';

export type ModelScopedScreen = 'inference' | 'history' | 'monitoring';

export function modelScopedPath(screen: ModelScopedScreen, modelId: string, version: string): string {
  return `/${screen}/${encodeURIComponent(modelId.trim())}/${encodeURIComponent(normalizeVersion(version))}`;
}

export function parseModelScopedPath(pathname: string): { screen: ModelScopedScreen; modelId: string; version: string } | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length !== 3) return null;
  const screen = parts[0] as ModelScopedScreen;
  if (!['inference', 'history', 'monitoring'].includes(screen)) return null;
  try {
    const modelId = decodeURIComponent(parts[1]);
    const version = decodeURIComponent(parts[2]);
    if (!modelId || !version) return null;
    return { screen, modelId, version };
  } catch {
    return null;
  }
}

export function isModelScopedScreen(screen: ScreenType): screen is ModelScopedScreen {
  return screen === 'inference' || screen === 'history' || screen === 'monitoring';
}

export function modelDetailPath(modelId: string): string {
  return `/models/${encodeURIComponent(modelId)}`;
}

export function normalizeVersion(version: string): string {
  return version.trim();
}
