# Decision Log : Skylark BI Agent

## Completed Scope

I built a minimal full-stack prototype of the Skylark BI Agent using Next.js App Router, TypeScript, Tailwind CSS, Zod, Vitest, monday.com GraphQL and Gemini.

The application includes:

* A responsive ChatGPT-style conversational interface
* Live read-only access to Deal Funnel and Work Order monday.com boards
* Paginated board-data retrieval
* Data normalisation and quality reporting
* Gemini-based query planning
* Deterministic metric calculations
* Clarification handling for ambiguous questions
* Rule-based fallback when Gemini is unavailable
* KPI cards, tables, graphs and structured visualisations
* Cross-board aggregate comparisons
* Leadership-update generation
* API, calculation, normalisation and secret-leakage tests
* Vercel-compatible deployment
* README and environment-configuration documentation

## Key Assumptions

* monday.com is the live source of truth. The application performs read-only GraphQL operations and does not create, update or delete board data.
* The imported boards follow the supplied Deal Funnel and Work Order structures, although internal monday.com column IDs may differ.
* Missing financial values represent unknown information and must not be treated as zero.
* Monetary values are in INR. GST-inclusive and GST-exclusive fields must remain separate.
* Masked deal names can repeat and therefore cannot be treated as unique cross-board identifiers.
* Cross-board comparisons are performed at aggregate sector or compatible owner level.
* Confirmed overdue work orders require a valid probable end date and a present non-completed execution status.
* Records with missing probable end dates or execution statuses are reported separately.
* Asia/Kolkata is used as the default business timezone.
* A personal monday.com API token is acceptable for this assignment prototype. A production multi-user application would require OAuth.

## Tech Stack Choice

Next.js App Router was selected because the assignment requires a single deployable application with a responsive frontend, server-side API routes and protected credentials.

TypeScript keeps monday.com records, query plans, metric results and visual response blocks typed. Tailwind CSS provides a polished responsive interface without introducing a heavy UI framework. Zod validates incoming chat requests and Gemini-generated query plans before business logic executes. Vitest provides fast unit and integration testing for calculations, normalisation, API failures and secret leakage.

The application is deployable on Vercel without a separate backend service or database.

## Conversational Interface

The interface is structured as a business chat rather than a static dashboard. Users can ask questions, choose clarification options and continue with follow-up questions in the same conversation.

Conversation context is included with chat requests and bounded server-side before being passed to Gemini. This preserves follow-up understanding while preventing unbounded request growth. API credentials remain server-only and are never included in conversation history.

Responses are rendered according to the question and may contain explanatory text, KPI cards, graphs, tables, insights and relevant caveats.

## AI Interprets, Code Calculates

Gemini is limited to translating conversational questions into a structured `QueryPlan`. The plan identifies the requested metric, filters, grouping, date scope and required clarification.

Zod rejects malformed or unsupported plans. Numeric totals, percentages, grouping, ranking and overdue calculations are performed by deterministic TypeScript functions.

This separation was chosen because language models are useful for interpreting flexible language but should not be trusted to calculate authoritative business totals. It keeps answers repeatable, testable and auditable.

The configured runtime model is `gemini-3.1-flash-lite`, selected for low latency and suitability for structured query planning.

## monday.com GraphQL API

Direct monday.com GraphQL was selected instead of MCP because it provides explicit control over authentication, pagination, board schemas and server-side data retrieval while remaining simple to deploy on Vercel.

The application:

* Uses monday.com as the only production business-data source
* Never hardcodes spreadsheet records into application code
* Fetches board columns and items server-side
* Pins the monday.com API version
* Uses `items_page(limit: 500)`
* Follows `next_items_page` cursors
* Retries temporary failures once
* Maps monday.com columns into normalized business fields
* Caches successful board responses for up to 60 seconds

The trade-off is tighter coupling to monday.com’s GraphQL schema compared with an MCP-based integration.

## Cross-Board Analysis

Exact row-level joins were rejected because masked deal names are repeated and can produce many-to-many matches. Joining on those names would create false precision and potentially incorrect conversion metrics.

Cross-board analysis is therefore performed using normalized aggregate dimensions such as sector or compatible owner code.

When a user requests an exact deal-to-work-order conversion that cannot be supported safely, the application explains that a reliable shared unique identifier is missing instead of inventing a relationship.

## Data Resilience

The data contains missing values, inconsistent text, malformed imported rows and negative financial anomalies.

The normalisation layer:

* Trims whitespace
* Normalizes text and status capitalisation
* Treats blank strings, `N/A`, `NA`, `null` and `-` as missing where appropriate
* Parses numbers and dates safely
* Counts invalid non-empty values as quality problems
* Excludes malformed repeated-header rows from business calculations
* Preserves negative numbers and reports them as anomalies
* Keeps missing values distinct from zero
* Reports data coverage and calculation caveats

Results remain meaningful when data is incomplete, while the user is informed about excluded or uncertain records.

## Metric Definitions

* **Open pipeline:** Sum of known masked deal values where normalized Deal Status is `Open`.
* **On-hold pipeline:** Calculated and reported separately from open pipeline.
* **Win rate:** `Won / (Won + Dead)`.
* **Collection rate:** Collected Amount Including GST divided by Billed Value Including GST.
* **Positive receivables:** Sum of receivable values greater than zero.
* **Unbilled backlog:** Sum of positive amount-to-be-billed values.
* **Confirmed overdue:** Probable End Date before the as-of date, Execution Status present, and normalized Execution Status not equal to `Completed`.

Missing values are excluded from applicable sums and reported as caveats. Negative receivables and backlog values are disclosed separately rather than silently converted to zero or netted against positive totals.

## Clarification Handling

Some business questions do not have one safe interpretation.

For example:

* “Revenue” may mean pipeline, contracted, billed or collected value.
* “Energy sector” may mean Renewables, Powerline or both.
* “Usable records” may refer to valid primary keys, recognised statuses or another completeness rule.

The application asks a focused clarification question with selectable choices instead of choosing an arbitrary definition.

## Failure Handling and Security

Temporary monday.com failures are retried once. If live board data remains unavailable, the application returns a clear error instead of generating totals from missing data.

Gemini failures activate deterministic fallback for supported queries. Invalid Gemini output is rejected by Zod and routed to fallback or clarification.

Secrets remain in server-side environment variables. Tokens, board credentials, stack traces and full internal errors are never returned to the browser or included in logs.

## Free-Tier Architecture

The prototype uses Vercel-compatible server routes, native `fetch`, no database and short in-memory caching. Basic in-memory per-IP rate limiting is included as a lightweight guard.

This design is sufficient for an assignment prototype and avoids paid infrastructure. However, cache and rate-limit state are not globally consistent across multiple serverless instances.

## Leadership Update Interpretation

I interpreted “prepare data for leadership updates” as generating a concise executive brief from the same deterministic metrics used by normal answers.

The leadership update contains:

1. Executive headline
2. Sales-pipeline position
3. Delivery and execution status
4. Billing and cash position
5. Top operational or concentration risks
6. Relevant data-quality caveats

It prioritises decision-relevant insights instead of presenting every available metric.



## Improvements With More Time

With additional time, I would add:

* monday.com OAuth
* Configurable board and column mapping
* A stable shared identifier across boards
* Broader natural-language date handling
* Persistent conversation storage
* Distributed caching and rate limiting
* Incremental monday.com synchronisation
* Streaming Gemini responses
* Richer chart selection and drill-down
* CSV and PDF exports
* Automated deployed smoke tests
* More mocked monday.com schema variants
* Observability with credential and board-data redaction
* Expanded accessibility and end-to-end testing
