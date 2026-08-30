# Decision Log

## Completed Scope

Built a minimal full-stack prototype for the Skylark BI Agent using Next.js App Router, TypeScript, Tailwind, Zod and Vitest. The app includes a responsive dashboard, chat flow, clarification handling, Monday.com GraphQL reads, pagination, normalization, deterministic metrics, Gemini planning with fallback, data-quality caveats, leadership updates, tests, README and environment documentation.

## Tech Stack Choice

Next.js App Router was chosen because the assignment needs a single deployable app with server-only credentials, API routes and a responsive UI. TypeScript keeps Monday records, query plans and metric calculations typed. Tailwind keeps the interface polished without adding a heavy component framework. Zod validates incoming chat requests and Gemini query plans before business logic runs. Vitest gives fast unit and integration tests for calculations, normalization, API failures and secret leakage.

## Conversational Interface

The UI is a ChatGPT-style business chat instead of a static dashboard. The user can ask repeated follow-up questions in one conversation. The browser may send full chat history, while the server compacts recent history before Gemini planning so long conversations do not fail request validation or expose credentials.

## AI Interprets, Code Calculates

Gemini is limited to translating conversational questions into a validated `QueryPlan`. Zod rejects malformed plans. Numeric totals, rates, grouping and overdue logic are calculated by deterministic TypeScript functions so answers remain auditable and do not depend on model arithmetic.

## Monday GraphQL API

Monday.com GraphQL is the only production data source because the PRD requires live board data, free-tier compatibility and no database. The implementation fetches board columns and items server-side, pins the API version, uses `items_page(limit: 500)`, follows `next_items_page` cursors and retries temporary failures once.

## Row-Level Joins Rejected

Cross-board analysis is aggregate-only by normalized sector or owner. Masked deal names can repeat and create many-to-many matches, so exact row linkage would create false precision. When a question asks for specific deal-to-work-order conversion, the app should explain that a reliable shared unique identifier is missing.

## Missing Data Handling

Missing numeric values are never converted to zero. Blank strings, `N/A`, `NA`, `null` and `-` are treated as missing where appropriate. Invalid non-empty dates and numbers are counted as quality issues. Negative numbers are preserved and flagged as anomalies, especially receivables and backlog values.

## Metric Definitions

Open pipeline sums known masked deal values where status is `Open`; on-hold pipeline is separate. Win rate is `Won / (Won + Dead)`. Collection rate uses collected including GST over billed including GST. Positive receivables and unbilled backlog include only positive values. Overdue work orders use probable end date before today in the configured business timezone and non-completed execution status.

## Free-Tier Architecture

The app uses Vercel-compatible server routes, native `fetch`, no database and short in-memory caching. Successful Monday board responses are cached for up to 60 seconds. Basic in-memory per-IP rate limiting is included as a lightweight guard.

## Leadership Update

The leadership update is treated as a concise executive brief assembled from the same deterministic metrics and caveats as regular answers. It includes the required sections: executive headline, sales pipeline, delivery and execution, billing and cash, top risks and data-quality caveats.

## Trade-Offs

The fallback parser intentionally covers only supported suggested questions and obvious acceptance scenarios. The UI is polished but deliberately simple. In-memory rate limiting and caching are acceptable for the assignment prototype but are not globally consistent across multiple serverless instances.

## Improvements With More Time

Add richer charting, broader natural-language date parsing, a full deployed smoke-test script, more mocked Monday schema variants, and optional observability that redacts board contents and credentials.
