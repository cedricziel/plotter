# Design

## Context

- `src/core/routing.ts` runs on the server, and also on the device for offline routing through a saved corridor (`TripRouter`). A route result has `warnings: string[]` in English. A failed route has a `reason` and an English `message`.
- `server/app.ts` throws `HttpError(status, message, extra)` and answers `{ error: message, ...extra }`. A failed route adds `reason`.
- `src/services/api.ts` turns an error answer into an `ApiError` whose message is the server's `error`. The route planner, the search note and the offline-save toast show that message.
- The client already words one warning in German by matching its English sentence (`warningText`).

## Decisions

### 1. A parallel `warningDetails` list, not objects in `warnings`

A client from before this change passes each warning to a function that expects a string, so an object would show as "[object Object]". The route answer keeps `warnings: string[]` and adds `warningDetails: { code, params, text }[]` in the same order. The client reads `warningDetails` and falls back to `warnings` from an older server.

Inside `routing.ts`, `warnings` becomes the structured list, because both the server and the offline router use it directly.

### 2. Every error gets a code, with a default per status

`HttpError` takes an optional `code`. Without one, it is `not-found` (404), `rate-limited` (429), `not-ready` (503), `internal` (5xx) or `bad-request` (other 4xx). Only errors a user can meet get their own code: `no-snap-start`, `no-snap-destination`, `unreachable`, `blocked`, `outside-area`, `corridor-too-large` and `corridor-too-long`. Validation messages for developers, such as "q must be 1 to 64 characters", stay as `bad-request`: the user sees "Invalid request".

Numbers go in `params` (`km`, `maxTiles`); the English `error` is unchanged.

### 3. The client words codes in `src/i18n/texts.ts`

- `warningText(warning)` takes a string or a coded warning. It words a known code with `t()`, shows `text` for an unknown code, and keeps the old sentence match for plain strings, so routes saved before this change still read in German.
- `errorText(body)` maps a known code to a dictionary key and shows `error` otherwise.
- `ApiError.message` is worded when the error arrives; it also keeps the server's `code`.

## Test strategy

Failing tests first, per layer:

- **Routing (unit)**: `tests/routing.test.ts` checks the codes and params of warnings and failures, and that the English text is unchanged.
- **Server**: `tests/server.test.ts` and `tests/server-fis.test.ts` check `code` and `params` in error bodies and `warningDetails` in a route answer.
- **Client (unit)**: `tests/server-texts.test.ts` checks both languages, the fallback for unknown and missing codes, and `api` errors including offline. `tests/courses.test.ts` checks that a course keeps `warningDetails`.

## Storybook

No story changes: the route sheet's warning list and the toasts keep their layout, and only the text changes.
