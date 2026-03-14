export const VERSION = '0.1.0';

export interface QaBotCore {
  version: string;
}

export function createQaBotCore(): QaBotCore {
  return { version: VERSION };
}
