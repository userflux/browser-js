// index.d.ts
declare module '@userflux/browser-js' {
    declare class UserFlux {
        static initialize(apiKey: string, options: object): void;
        static identify(parameters: object): Promise<any>;
        static track(parameters: object): Promise<any | null>;
        static reset(): Promise<void>;
        static updateDefaultTrackingProperties(properties: object): void;
        static getUserId(): string | null;
        static getAnonymousId(): string | null;
        static flush(): Promise<void>;
    }

    export = UserFlux;
}
