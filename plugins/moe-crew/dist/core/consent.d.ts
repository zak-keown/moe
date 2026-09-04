/** Durable, harness-neutral consent state owned by Moe. */
export declare function consentPath(home: string, environment?: NodeJS.ProcessEnv): string;
export declare function hasConsent(home: string, environment?: NodeJS.ProcessEnv): boolean;
export declare function grantConsent(home: string, environment?: NodeJS.ProcessEnv): void;
