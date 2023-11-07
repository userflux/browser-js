// index.d.ts
declare module '@userflux/browser-js' {
    declare class UserFlux {
        static initialize(apiKey: string, options: object): void;
        static identify(attributes: object, userId?: string | undefined): void;
        static identifyEnrichDisabled(attributes: object, userId?: string | undefined): void;
        static track(name: string, properties: object, userId?: string | undefined): void;
        static trackEnrichDisabled(name: string, properties: object, userId?: string | undefined): void;
        static reset(): void;
    }

    export = UserFlux;
}
