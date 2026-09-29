## Why

The German UI still shows two kinds of English text, both written by the server:

- **Router warnings.** `src/core/routing.ts` returns warnings as finished English sentences. The client matches one known sentence with a regular expression, and shows every other warning in English.
- **API errors.** `server/app.ts` answers `{ error: message }`. The client shows the message as-is in toasts and the search note, for example "No charted waterway within 5 km of the destination" or "too many requests".

A skipper who chose Deutsch should not get an English sentence when a route fails. The app-language spec excludes server error messages from translation today. This change drops that exception.

## What Changes

- The routing result gives each warning a `code` and `params` next to its English `text`. The route API adds these as a new `warningDetails` list next to the existing `warnings` strings.
- Route failures carry a `code` and `params` next to the English `message`.
- Every API error body gets a `code`, and `params` where the text has numbers: `{ error, code, params? }`. The English `error` stays.
- The client words known codes with `t()` in the chosen language. It shows the English text for an unknown or missing code.
- The change is additive: `warnings` stays a list of strings, and `error` stays an English string. Older clients keep working, and the new client still reads answers from an older server.
- The client's own fallback for an unreadable answer is translated too.

## Capabilities

### Modified Capabilities

- `app-language`: the "Translated texts" requirement now covers router warnings and error messages from the server.

## Impact

- **iPhone and iPad (Safari and home-screen app)**: none beyond the text of toasts, the route sheet's warnings and the search note. The layout does not change.
- **Code**:
  - `src/core/routing.ts`: structured warnings and failure codes.
  - `server/http.ts`: `HttpError` carries a `code`, with a default per HTTP status.
  - `server/app.ts`: sends `code` and `params` in error bodies, and `warningDetails` with a route.
  - `src/core/api.ts`: the `ApiWarning` and `ApiErrorBody` types.
  - `src/i18n/texts.ts`: `warningText` (moved from `maneuvers.ts`) and a new `errorText`.
  - `src/services/api.ts` and `src/services/courses.ts`: read the codes.
- **Tests, written first**:
  - `tests/routing.test.ts`: warnings and failures carry their codes and params, and the English text is unchanged.
  - `tests/server.test.ts`: error bodies carry `code` (and `params`) for no route, rate limited, bad request, outside the area, not ready and corridor limits; a route answer carries `warningDetails`.
  - `tests/server-texts.test.ts`: `warningText` and `errorText` in English and German, the fallback to the English text for unknown and missing codes, and `api.route` turning a German error body into a German `ApiError` message, including offline.
- **Storybook**: no new stories. The route sheet's warning list keeps its layout.
