# Tasks

## 1. Server

- [x] 1.1 **Router codes (test first).** Extend `tests/routing.test.ts` so the unknown-clearance warning is `{ code: 'unknown-clearance', params: { count }, text }` with the English text unchanged, and failures carry `code` `no-snap-start`, `no-snap-destination` (with `params.km`), `unreachable` or `blocked`. Show it failing, then implement it in `src/core/routing.ts`.
- [x] 1.2 **API codes (test first).** Extend `tests/server.test.ts`: a route answer carries `warnings` (strings) and `warningDetails`; error bodies carry `code` for no route, rate limited, bad request, outside the area, not ready and the corridor limits, and keep `error`. Show it failing, then implement `HttpError.code` in `server/http.ts` and the codes in `server/app.ts`.

## 2. Client

- [x] 2.1 **Texts (test first).** Write `tests/server-texts.test.ts` for `warningText` and `errorText` in both languages, with the fallback for an unknown or missing code, and for `api` turning error bodies and an unreachable service into messages in the chosen language. Show it failing, then implement `src/i18n/texts.ts`, the dictionary entries, `src/services/api.ts` and `src/services/courses.ts`. Extend `tests/courses.test.ts` so a charted course keeps `warningDetails` when the server sends them.
- [x] 2.2 **Checks.** Run `npm run typecheck`, `npm test` (including `tests/untranslated.test.ts`), `npm run build` and `npm run build:server`.
- [ ] 2.3 **Device check.** On iPhone and iPad in German, chart a route to a point far from any waterway and confirm the toast is German. Deferred to a device run if none is available.
