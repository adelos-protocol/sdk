/**
 * Logger utility that respects debug mode
 */

let debugMode = false;

export function setDebugMode(enabled: boolean) {
  debugMode = enabled;
}

export function log(...args: any[]) {
  if (debugMode) {
    console.log(...args);
  }
}

export function warn(...args: any[]) {
  if (debugMode) {
    console.warn(...args);
  }
}

export function error(...args: any[]) {
  // Always show errors regardless of debug mode
  console.error(...args);
}
