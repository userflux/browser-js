// index.d.ts
declare module '@userflux/browser-js' {
    declare class UserFlux {
        static initialize(apiKey: string, options: object): void;
        static identify(parameters: object): Promise<any>;
        static track(parameters: object): Promise<any | null>;
        static reset(): void;
        static updateDefaultTrackingProperties(properties: object): void;
        static getUserId(): string | null;
        static getAnonymousId(): string | null;
    }

    export = UserFlux;
}
