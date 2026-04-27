interface CapacitorInterface {
  isNativePlatform(): boolean;
  getPlatform(): string;
}

declare global {
  interface Window {
    Capacitor?: CapacitorInterface;
  }
}

export {};