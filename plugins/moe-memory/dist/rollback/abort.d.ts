export interface AbortRollbackOptions {
    dataDir?: string;
}
export interface AbortRollbackResult {
    aborted: boolean;
    message: string;
}
export declare function abortRollback(options?: AbortRollbackOptions): AbortRollbackResult;
