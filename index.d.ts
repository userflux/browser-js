// index.d.ts
declare module '@userflux/analytics-js' {
    export default class UserFlux {
        static initialize(apiKey: string, options: object): void;
        static identify(attributes: object, userId?: string | undefined): void;
        static track(name: string, properties: object, userId?: string | undefined): void;
        static reset(): void;
    }
}
