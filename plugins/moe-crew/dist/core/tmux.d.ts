import { type Runner } from "./proc.js";
export declare function makeTmux(run?: Runner): {
    /** Returns true if the named session exists, false otherwise. Never throws. */
    hasSession(name: string): Promise<boolean>;
    killSession(name: string): Promise<void>;
    /** Returns the captured pane text. */
    capturePane(name: string): Promise<string>;
    /** Returns the captured pane text including the full scrollback history. */
    capturePaneFull(name: string): Promise<string>;
    /** Send text literally to the pane (no key-name interpretation). */
    sendText(name: string, text: string): Promise<void>;
    /** Send the Enter key to the pane. */
    sendEnter(name: string): Promise<void>;
    /** Send a named key (e.g. 'Down', 'Up') to the pane. */
    sendKey(name: string, key: string): Promise<void>;
    /** Create a new detached session running the given argv with the given env. */
    newSession(name: string, cwd: string, env: Record<string, string>, argv: string[]): Promise<void>;
    /** Respawn the current pane in an existing session (used by adopt). */
    respawnPane(name: string, cwd: string, env: Record<string, string>, argv: string[]): Promise<void>;
};
/** The type of the tmux client object returned by makeTmux. */
export type Tmux = ReturnType<typeof makeTmux>;
/** Default real tmux instance. */
export declare const tmux: {
    /** Returns true if the named session exists, false otherwise. Never throws. */
    hasSession(name: string): Promise<boolean>;
    killSession(name: string): Promise<void>;
    /** Returns the captured pane text. */
    capturePane(name: string): Promise<string>;
    /** Returns the captured pane text including the full scrollback history. */
    capturePaneFull(name: string): Promise<string>;
    /** Send text literally to the pane (no key-name interpretation). */
    sendText(name: string, text: string): Promise<void>;
    /** Send the Enter key to the pane. */
    sendEnter(name: string): Promise<void>;
    /** Send a named key (e.g. 'Down', 'Up') to the pane. */
    sendKey(name: string, key: string): Promise<void>;
    /** Create a new detached session running the given argv with the given env. */
    newSession(name: string, cwd: string, env: Record<string, string>, argv: string[]): Promise<void>;
    /** Respawn the current pane in an existing session (used by adopt). */
    respawnPane(name: string, cwd: string, env: Record<string, string>, argv: string[]): Promise<void>;
};
