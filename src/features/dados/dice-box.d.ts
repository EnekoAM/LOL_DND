declare module '@3d-dice/dice-box' {
  export type DiceRollResult = {
    qty: number;
    sides: number;
    mods?: unknown[];
    rolls: { value: number }[];
    value: number;
  };

  export type DiceBoxConfig = {
    id?: string;
    assetPath: string;
    container?: string | HTMLElement;
    gravity?: number;
    mass?: number;
    friction?: number;
    restitution?: number;
    angularDamping?: number;
    linearDamping?: number;
    spinForce?: number;
    throwForce?: number;
    startingHeight?: number;
    settleTimeout?: number;
    offscreen?: boolean;
    delay?: number;
    lightIntensity?: number;
    enableShadows?: boolean;
    shadowTransparency?: number;
    theme?: string;
    preloadThemes?: string[];
    themeColor?: string;
    scale?: number;
    suspendSimulation?: boolean;
    origin?: string;
    onRollComplete?: (results: DiceRollResult[]) => void;
    onDieComplete?: (die: unknown) => void;
  };

  export default class DiceBox {
    constructor(config: DiceBoxConfig);
    init(): Promise<this>;
    roll(notation: string | Record<string, unknown> | Array<string | Record<string, unknown>>): Promise<DiceRollResult[]>;
    clear(): void;
    hide(className?: string): void;
    show(): void;
    resizeWorld(): void;
    loadTheme(theme: string): Promise<unknown>;
    updateConfig(config: Partial<DiceBoxConfig>): Promise<unknown>;
    onRollComplete: ((results: DiceRollResult[]) => void) | null;
  }
}
