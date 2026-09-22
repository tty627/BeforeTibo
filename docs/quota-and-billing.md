# Quota and billing

Token counts, account quota percentages and local dispatch counts are independent. Cached tokens are not added twice. Missing final usage remains partial/null. An account snapshot can include other sessions' consumption.

The App Server observer exposes only initialize, account/read and account/rateLimits/read with correlated IDs and deadlines. It rejects login/logout, process execution, reset redemption, email and purchase methods. It must share the verified effective identity/configuration context with the worker. No auth.json content is read or copied by BeforeTibo.

Quota mode requires known model-to-bucket mapping, all relevant fresh windows, unchanged identity and cycle metadata, and remaining percentage above the reserve. Any missing/stale/reset/changed condition stops new dispatch; higher risk can cancel active work. Window durations come from upstream metadata, not assumed week/five-hour labels. Percentages are never summed.

Bounded mode has no real-time quota guard. The product never silently changes quota mode into bounded mode. No service limit bypass, account rotation, API fallback, credit purchase or reset consume path is implemented. Existing credits may still be consumed by a real Codex task. Local limits are not precise billing caps. require_zero_incremental_charge is blocked without a verified server hard guard.

Real quota integration is NOT RUN. Offline protocol fixtures are synthetic except the explicitly identified public generated schemas/help captures. They establish parser behavior, not account or billing support.
